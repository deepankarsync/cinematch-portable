import os
import pickle
import pandas as pd
import numpy as np
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sklearn.metrics.pairwise import cosine_similarity
from openai import AsyncOpenAI
from typing import List

# ==========================================
# Configuration & Setup
# ==========================================
LLM_BASE_URL = os.getenv('LLM_BASE_URL', 'https://integrate.api.nvidia.com/v1')
LLM_MODEL = os.getenv('LLM_MODEL', 'meta/llama-3.1-70b-instruct')
LLM_API_KEY = os.getenv('LLM_API_KEY', '') # Make sure to put your real key here!
LLM_TEMPERATURE = float(os.getenv('LLM_TEMPERATURE', '1.0'))
LLM_MAX_TOKENS = int(os.getenv('LLM_MAX_TOKENS', '16384'))
TMDB_TOKEN = os.getenv('TMDB_TOKEN', '')

# Initialize OpenAI client for the local vLLM server
client = AsyncOpenAI(
    base_url=LLM_BASE_URL,
    api_key=LLM_API_KEY
)

app = FastAPI(title="CineMatch Backend")

# Allow CORS for local frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Data Loading (Run on Startup)
# ==========================================
print("Loading data into memory...")

# 1. Load ID mappings
links_df = pd.read_csv('links.csv').dropna(subset=['tmdbId'])
# Create fast lookup dictionaries
tmdb_to_movie = dict(zip(links_df['tmdbId'].astype(int), links_df['movieId'].astype(int)))
movie_to_tmdb = dict(zip(links_df['movieId'].astype(int), links_df['tmdbId'].astype(int)))

# 2. Load Movie Metadata
with open('cache/movieid_metadata_ultimate.pkl', 'rb') as f:
    movie_metadata = pickle.load(f)

# 3. Load Embeddings for First-Stage Candidate Retrieval
with open('cache/movieid_list.pkl', 'rb') as f:
    movieid_list = pickle.load(f)  # List of length 85995
    
with open('cache/description_embeddings.pkl', 'rb') as f:
    embeddings_matrix = pickle.load(f)  # Shape (85995, 384)

# Map movieId to its row index in the embeddings matrix
movie_to_idx = {m_id: idx for idx, m_id in enumerate(movieid_list)}
idx_to_movie = {idx: m_id for idx, m_id in enumerate(movieid_list)}

print("Data loaded successfully!")

# ==========================================
# Pydantic Models
# ==========================================
class RecommendationRequest(BaseModel):
    tmdb_ids: List[int]

class RecommendationResponse(BaseModel):
    llm_recommendations: List[int]
    embedding_recommendations: List[int]

# ==========================================
# Helper Functions
# ==========================================
def format_movie_context(movie_id):
    """Formats the movie metadata into a readable string for the LLM."""
    if movie_id not in movie_metadata:
        return f"Movie {movie_id}"
    
    m = movie_metadata[movie_id]
    text = f"Title: {m.get('title', 'Unknown')}\n"
    if m.get('genres'): text += f"Genres: {m.get('genres')}\n"
    if m.get('overview'): text += f"Overview: {m.get('overview')}\n"
    return text.strip()

def build_rerank_prompt(taste_profile_ids, candidate_ids):
    """Constructs the prompt for the LLM to rerank candidates."""
    
    # 1. Describe the user's taste
    taste_str = "The user has liked the following movies:\n"
    for m_id in taste_profile_ids:
        title = movie_metadata.get(m_id, {}).get('title', f"Movie {m_id}")
        taste_str += f"- {title}\n"
        
    # 2. List the candidates
    candidate_str = "Here is a list of candidate movies to recommend from:\n\n"
    for i, m_id in enumerate(candidate_ids):
        candidate_str += f"[{i+1}]\n{format_movie_context(m_id)}\n\n"
        
    # 3. Instructions
    instructions = (
        "Based on the user's liked movies, select the top 10 most relevant movies from the candidate list.\n"
        "Return ONLY a numbered list of the candidate IDs (e.g. [1], [5], [12]) in order of recommendation. "
        "Do not include any other text."
    )
    
    prompt = f"{taste_str}\n\n{candidate_str}\n\n{instructions}"
    return prompt

def parse_llm_ranking(raw_text, candidate_ids):
    """Extracts the chosen candidate index from the LLM output."""
    matches = re.findall(r'\[(\d+)\]', raw_text)
    
    recommended_movie_ids = []
    seen = set()
    for match in matches:
        try:
            idx = int(match) - 1 # Convert to 0-indexed
            if 0 <= idx < len(candidate_ids) and idx not in seen:
                recommended_movie_ids.append(candidate_ids[idx])
                seen.add(idx)
        except ValueError:
            pass
            
    return recommended_movie_ids

# ==========================================
# Endpoints
# ==========================================
@app.get("/config")
async def get_config():
    """Expose non-sensitive environment config to the frontend."""
    return {"tmdb_token": TMDB_TOKEN}

@app.post("/recommend", response_model=RecommendationResponse)
async def get_recommendations(req: RecommendationRequest):
    if not req.tmdb_ids:
        raise HTTPException(status_code=400, detail="Must provide at least one tmdb_id")
        
    # 1. Convert frontend tmdbIds to backend movieIds
    taste_profile_mids = [tmdb_to_movie[tid] for tid in req.tmdb_ids if tid in tmdb_to_movie]
    
    if not taste_profile_mids:
        raise HTTPException(status_code=400, detail="Could not map any provided tmdb_ids to our database")
        
    # 2. Get embeddings for the selected movies
    valid_indices = [movie_to_idx[mid] for mid in taste_profile_mids if mid in movie_to_idx]
    
    if not valid_indices:
        raise HTTPException(status_code=400, detail="No embeddings found for the selected movies")
        
    # 3. First-Stage Retrieval: Compute mean embedding and find Nearest Neighbors
    selected_embeddings = embeddings_matrix[valid_indices]
    user_vector = np.mean(selected_embeddings, axis=0).reshape(1, -1)
    
    # Cosine similarity against all movies
    similarities = cosine_similarity(user_vector, embeddings_matrix)[0]
    
    # Get top 100 indices
    top_100_idx = np.argsort(similarities)[::-1][:100]
    
    # Filter out movies the user already selected and keep the top 30 as candidates
    candidate_mids = []
    for idx in top_100_idx:
        m_id = idx_to_movie[idx]
        if m_id not in taste_profile_mids:
            candidate_mids.append(m_id)
        if len(candidate_mids) == 15:
            break
            
    # 4. Second-Stage Reranking: Build Prompt and Call LLM
    prompt = build_rerank_prompt(taste_profile_mids, candidate_mids)
    
    try:
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a movie recommendation engine."},
                {"role": "user", "content": prompt}
            ],
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
            top_p=1.0
        )
        llm_output = response.choices[0].message.content
        print("LLM Output:", llm_output)
        
    except Exception as e:
        print("LLM Error:", str(e))
        # Fallback to just returning the top 10 candidates from SVD/Embeddings
        llm_output = "\n".join([f"[{i+1}]" for i in range(10)])
        
    # 5. Parse LLM response
    final_mids = parse_llm_ranking(llm_output, candidate_mids)
    
    # If LLM failed to parse properly, fallback to original candidates
    if not final_mids:
        final_mids = candidate_mids[:10]
        
    # 6. Convert recommended movieIds back to tmdbIds for the frontend
    final_tmdb_ids = [movie_to_tmdb[mid] for mid in final_mids if mid in movie_to_tmdb]
    embedding_tmdb_ids = [movie_to_tmdb[mid] for mid in candidate_mids[:10] if mid in movie_to_tmdb]
    
    return {
        "llm_recommendations": final_tmdb_ids[:10],
        "embedding_recommendations": embedding_tmdb_ids[:10]
    }

# ==========================================
# Serve Frontend (must be last — catches all remaining paths)
# ==========================================
import os as _os
_frontend_dir = _os.path.join(_os.path.dirname(__file__), "cinematch-frontend")
if _os.path.isdir(_frontend_dir):
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")

# Run block for local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(_os.getenv("PORT", "8001")), reload=True)
