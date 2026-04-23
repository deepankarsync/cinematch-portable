// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const tasteProfile = document.getElementById('tasteProfile');
const profileCount = document.getElementById('profileCount');
const recommendBtn = document.getElementById('recommendBtn');
const recommendationsModal = document.getElementById('recommendationsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const llmGrid = document.getElementById('llmGrid');
const embeddingGrid = document.getElementById('embeddingGrid');
const loadingState = document.getElementById('loadingState');

const configModal = document.getElementById('configModal');
const tmdbTokenInput = document.getElementById('tmdbTokenInput');
const saveConfigBtn = document.getElementById('saveConfigBtn');

// State
const CUT_OFF_DATE = '2023-02-01'; // Exclude movies from Feb 2023 onwards
let TMDB_TOKEN = localStorage.getItem('TMDB_TOKEN') || '';
let selectedMovies = new Map(); // TMDB_ID -> Movie Object
let searchTimeout = null;

// Initialize
async function init() {
    // Try to get token from backend first
    try {
        const res = await fetch('/config');
        if (res.ok) {
            const data = await res.json();
            if (data.tmdb_token) {
                TMDB_TOKEN = data.tmdb_token;
                localStorage.setItem('TMDB_TOKEN', TMDB_TOKEN);
            }
        }
    } catch(err) {
        console.error("Failed to fetch token from backend:", err);
    }

    if (!TMDB_TOKEN) {
        configModal.classList.remove('hidden');
    } else {
        configModal.classList.add('hidden');
        // Load some popular movies initially when token exists
        fetchMovies('https://api.themoviedb.org/3/discover/movie?language=en-US&sort_by=popularity.desc&primary_release_date.lte=2023-01-31&page=1');
    }
}
init();

// Save Token
saveConfigBtn.addEventListener('click', () => {
    const token = tmdbTokenInput.value.trim();
    if (token) {
        TMDB_TOKEN = token;
        localStorage.setItem('TMDB_TOKEN', token);
        configModal.classList.add('hidden');

        // Load some popular movies initially
        fetchMovies('https://api.themoviedb.org/3/discover/movie?language=en-US&sort_by=popularity.desc&primary_release_date.lte=2023-01-31&page=1');
    }
});

// TMDB API Headers
const getHeaders = () => ({
    accept: 'application/json',
    Authorization: `Bearer ${TMDB_TOKEN}`
});

// Search Input Listener with Debounce
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);

    if (query.length < 2) {
        if (query.length === 0) fetchMovies('https://api.themoviedb.org/3/discover/movie?language=en-US&sort_by=popularity.desc&primary_release_date.lte=2023-01-31&page=1');
        return;
    }

    searchTimeout = setTimeout(() => {
        const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
        fetchMovies(url);
    }, 500); // 500ms debounce
});

// Fetch Movies from TMDB
async function fetchMovies(url) {
    if (!TMDB_TOKEN) return;

    try {
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();
        if (data.status_code) {
           throw new Error(data.status_message || 'TMDB API Error');
        }
        renderSearchResults(data.results || []);
    } catch (err) {
        console.error('Error fetching movies:', err);
        searchResults.innerHTML = `<div class="empty-state" style="color: var(--danger);">Failed to load movies. (Error: ${err.message})<br><br>Check your TMDB API token or disable adblockers.</div>`;
    }
}

// Render Search Results
function renderSearchResults(movies) {
    searchResults.innerHTML = '';

    if (movies.length === 0) {
        searchResults.innerHTML = '<div class="empty-state">No movies found. Try another search.</div>';
        return;
    }

    // Filter out movies without posters, and exclude movies released on/after Feb 2023
    const validMovies = movies.filter(m =>
        m.poster_path && m.title &&
        (!m.release_date || m.release_date < CUT_OFF_DATE)
    );

    validMovies.forEach(movie => {
        const isSelected = selectedMovies.has(movie.id);
        const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
        const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;

        const card = document.createElement('div');
        card.className = `movie-card ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
            <div class="poster-container">
                <img src="${posterUrl}" alt="${movie.title}" loading="lazy">
            </div>
            <div class="info-container">
                <h3>${movie.title}</h3>
                <span class="year">${year}</span>
            </div>
        `;

        if (!isSelected) {
            card.addEventListener('click', () => addToProfile(movie, card));
        }

        searchResults.appendChild(card);
    });
}

// Add to Taste Profile
function addToProfile(movie, cardElement) {
    if (selectedMovies.has(movie.id)) return;

    selectedMovies.set(movie.id, movie);
    cardElement.classList.add('selected');
    cardElement.removeEventListener('click', null); // clear listeners

    updateProfileUI();
}

// Remove from Taste Profile
function removeFromProfile(movieId) {
    selectedMovies.delete(movieId);

    // Re-render search results to un-select the card
    const query = searchInput.value.trim();
    if (query.length >= 2) {
        const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
        fetchMovies(url);
    } else {
        fetchMovies('https://api.themoviedb.org/3/discover/movie?language=en-US&sort_by=popularity.desc&primary_release_date.lte=2023-01-31&page=1');
    }

    updateProfileUI();
}

// Update Taste Profile UI
function updateProfileUI() {
    tasteProfile.innerHTML = '';
    profileCount.textContent = selectedMovies.size;

    // Enable/Disable recommend button
    recommendBtn.disabled = selectedMovies.size === 0;

    if (selectedMovies.size === 0) {
        tasteProfile.innerHTML = '<div class="empty-state">Select movies from the search results to add them here.</div>';
        return;
    }

    Array.from(selectedMovies.values()).forEach(movie => {
        const year = movie.release_date ? movie.release_date.split('-')[0] : '';
        const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : '';

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <img src="${posterUrl}" alt="${movie.title}">
            <div class="info">
                <h4>${movie.title}</h4>
                <p>${year}</p>
            </div>
            <button class="btn-icon" onclick="removeFromProfile(${movie.id})">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        tasteProfile.appendChild(item);
    });
}

// Get Recommendations
recommendBtn.addEventListener('click', async () => {
    if (selectedMovies.size === 0) return;

    // Open Modal and show loading
    recommendationsModal.classList.remove('hidden');
    llmGrid.innerHTML = '';
    embeddingGrid.innerHTML = '';
    loadingState.classList.remove('hidden');

    const tmdbIds = Array.from(selectedMovies.keys());

    try {
        // Call Python Backend (relative path works on any host/port)
        const response = await fetch('/recommend', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tmdb_ids: tmdbIds })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Fetch details for each recommended TMDB ID to show posters
        await renderRecommendations(data.llm_recommendations, llmGrid);
        await renderRecommendations(data.embedding_recommendations, embeddingGrid);
        
        loadingState.classList.add('hidden');

    } catch (err) {
        console.error('Error fetching recommendations:', err);
        loadingState.classList.add('hidden');
        llmGrid.innerHTML = `
            <div class="empty-state" style="color: var(--danger);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 1rem; display:block;"></i>
                Failed to connect to the recommendation engine. Is the Python backend running on port 8001?
                <br><br>Error: ${err.message}
            </div>
        `;
    }
});

// Render Recommendations in Modal
async function renderRecommendations(items, container) {
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state">The model returned no recommendations.</div>';
        return;
    }

    for (const id of items) {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?language=en-US`, { headers: getHeaders() });
            if (!res.ok) continue;

            const movie = await res.json();
            if (!movie.poster_path) continue; // Skip if no poster

            const year = movie.release_date ? movie.release_date.split('-')[0] : '';
            const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;

            const card = document.createElement('div');
            card.className = 'movie-card';
            
            card.innerHTML = `
                <div class="poster-container">
                    <img src="${posterUrl}" alt="${movie.title}" loading="lazy">
                </div>
                <div class="info-container">
                    <h3>${movie.title}</h3>
                    <span class="year">${year}</span>
                </div>
            `;
            
            // clicking a recommendation opens its TMDB page
            card.addEventListener('click', () => {
                window.open(`https://www.themoviedb.org/movie/${id}`, '_blank');
            });
            
            container.appendChild(card);
            
        } catch (err) {
            console.error(`Failed to fetch movie details for ID ${id}:`, err);
        }
    }
}

// Close Modal
closeModalBtn.addEventListener('click', () => {
    recommendationsModal.classList.add('hidden');
});
