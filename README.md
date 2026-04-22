# CineMatch Portable

A two-stage movie recommendation system combining **SVD Collaborative Filtering** with **LLM Reranking** using rich TMDB metadata.

- **Stage 1**: SVD Collaborative Filtering → Top-50 candidates per user
- **Stage 2**: LLM Reranking with rich metadata descriptions (titles, genres, cast, plot, director)

**Dataset**: MovieLens-32M (32M ratings, 87,586 movies) + The Ultimate 1Million Movies Dataset (TMDB + IMDb)
**Evaluation**: Leave-one-out protocol, HR@K and NDCG@K

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/deepankarsync/cinematch-portable.git
cd cinematch-portable
```

### 2. Download Datasets

The large data files are **not included** in the repository. Run the download script:

```bash
chmod +x download_data.sh
./download_data.sh
```

#### Manual Download (if script doesn't auto-download)

**MovieLens 32M** (~1.6 GB zipped):
1. Visit https://grouplens.org/datasets/movielens/32m.html
2. Download `ml-32m.zip`
3. Extract and copy these files to the project root:
   - `ratings.csv` (837 MB) — 32M user-movie ratings
   - `movies.csv` (4 MB) — movie titles and genres
   - `links.csv` (2 MB) — MovieLens → TMDB/IMDb ID mapping
   - `tags.csv` (70 MB) — user-generated tags

**The Ultimate 1Million Movies Dataset (TMDB + IMDb)** (~694 MB):
1. Visit https://www.kaggle.com/datasets/alanvourch/tmdb-movies-daily-updates
2. Download `TMDB_all_movies.csv`
3. Move it to the project root

> **Tip**: Install the [Kaggle CLI](https://github.com/Kaggle/kaggle-api) for automatic downloads:
> ```bash
> pip install kaggle
> kaggle datasets download -d alanvourch/tmdb-movies-daily-updates
> ```

### 3. Install Dependencies

```bash
pip install jupyter pandas numpy scipy scikit-learn matplotlib seaborn openai
```

### 4. Start an LLM Server (for LLM Reranking)

The notebook uses a local **vLLM** OpenAI-compatible server by default. Start it before running the LLM cells:

```bash
pip install vllm
vllm serve Qwen/Qwen2.5-3B-Instruct --port 8000
```

> **Alternative**: You can use any OpenAI-compatible endpoint (Ollama, LM Studio, etc.) by setting environment variables:
> ```bash
> export LLM_BASE_URL="http://localhost:11434/v1"  # e.g., Ollama
> export LLM_MODEL="qwen2.5:3b"
> ```

### 5. Run the Notebook

```bash
jupyter notebook ultimate_cinematch.ipynb
```

Run cells sequentially. The notebook is organized into numbered steps:
- **Cells 1–7**: Data loading, EDA, SVD training, candidate generation
- **Cell 8**: LLM configuration and artifact loading
- **Cells 9–12**: LLM reranking, evaluation, and comparison report
- **Cells 13+**: Ablation studies and statistical significance tests

---

## Project Structure

```
cinematch-portable/
├── ultimate_cinematch.ipynb          # Main notebook (all stages)
├── download_data.sh                  # Script to download datasets
├── artifacts/                        # Pre-computed evaluation data (tracked in git)
│   ├── test_df.pkl                   # Leave-one-out test split
│   ├── baseline_sampled_results.pkl  # Baseline metrics for comparison
│   └── llm_rankings.pkl             # Legacy LLM rankings
├── results/                          # Generated at runtime (gitignored)
│   └── ultimate_metrics_summary_*.json
├── cache/                            # Generated at runtime (gitignored)
│   ├── svd_factors_*.pkl
│   ├── candidate_pools_*.pkl
│   ├── description_embeddings.pkl
│   └── movieid_metadata_ultimate.pkl
├── ratings.csv                       # ⬇ Download required
├── TMDB_all_movies.csv               # ⬇ Download required
├── movies.csv                        # ⬇ Download required
├── links.csv                         # ⬇ Download required
└── tags.csv                          # ⬇ Download required
```

> Files marked ⬇ are excluded from git and must be downloaded via `download_data.sh` or manually.

---

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `BINARIZE_RATING_THRESHOLD` | `4.0` | Rating threshold for binarizing interactions |
| `LLM_BASE_URL` | `http://localhost:8000/v1` | OpenAI-compatible LLM endpoint |
| `LLM_MODEL` | `Qwen/Qwen2.5-3B-Instruct` | Model name for LLM reranking |
| `LLM_API_KEY` | `EMPTY` | API key (use `EMPTY` for local servers) |
| `LLM_TEMPERATURE` | `0.1` | Sampling temperature |
| `LLM_MAX_TOKENS` | `256` | Max tokens per LLM response |
| `LLM_SAMPLE_USERS` | `10000` | Number of users for LLM reranking |
| `LLM_FORCE_REFRESH` | `0` | Set to `1` to regenerate rankings even if cached |

---

## Reproducing Results

1. Download all datasets (see Step 2 above)
2. Start a vLLM server with `Qwen/Qwen2.5-3B-Instruct`
3. Run all notebook cells sequentially
4. First run will:
   - Train SVD and cache factors (~1-3 min)
   - Generate candidate pools (~1 min)
   - Compute description embeddings (~5-10 min)
   - Rerank 10,000 users via LLM (~4.5 hours with Qwen2.5-3B)
5. Subsequent runs load from cache — instant

> **Note**: The `artifacts/` directory ships with pre-computed `test_df.pkl` required for evaluation (Step 10). Without it, evaluation cells will raise an error.

---

## Hardware Requirements

- **RAM**: 16 GB+ (MovieLens-32M ratings table is ~837 MB in memory)
- **GPU**: Any GPU with 8 GB+ VRAM for running Qwen2.5-3B via vLLM
- **Disk**: ~2 GB for datasets + ~500 MB for cached artifacts

---

## License

This project uses publicly available datasets:
- MovieLens 32M: Licensed under [GroupLens terms](https://grouplens.org/datasets/movielens/)
- TMDB: Data sourced from [Kaggle](https://www.kaggle.com/datasets/alanvourch/tmdb-movies-daily-updates), subject to TMDB terms of use
