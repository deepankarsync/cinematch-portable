#!/usr/bin/env bash
# Download large data files not included in the git repo.
#
# Required files:
#   - ratings.csv  (837 MB) - MovieLens 32M ratings
#   - TMDB_all_movies.csv (694 MB) - The Ultimate 1Million Movies Dataset (TMDB + IMDb)
#   - tags.csv (70 MB) - MovieLens tags
#   - links.csv (2 MB) - MovieLens links
#   - movies.csv (4 MB) - MovieLens movies
#
# Usage:
#   chmod +x download_data.sh
#   ./download_data.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================================"
echo "CineMatch Data Download Script"
echo "================================================================"

# --- MovieLens 32M ---
ML_FILES=("ratings.csv" "tags.csv" "links.csv" "movies.csv")
ML_MISSING=()
for f in "${ML_FILES[@]}"; do
    [ ! -f "${SCRIPT_DIR}/${f}" ] && ML_MISSING+=("$f")
done

if [ ${#ML_MISSING[@]} -eq 0 ]; then
    echo "✓ All MovieLens files already exist, skipping."
else
    echo ""
    echo "Downloading MovieLens 32M dataset..."
    echo "  https://files.grouplens.org/datasets/movielens/ml-32m.zip"
    echo ""
    echo "Steps:"
    echo "  1. Visit the URL above and download ml-32m.zip"
    echo "  2. Extract and copy these files to ${SCRIPT_DIR}/:"
    for f in "${ML_MISSING[@]}"; do
        echo "     - ml-32m/${f}"
    done
    echo ""

    ML32M_URL="${ML32M_URL:-https://files.grouplens.org/datasets/movielens/ml-32m.zip}"
    echo "Downloading from $ML32M_URL ..."
    wget -O /tmp/ml-32m.zip "$ML32M_URL"
    unzip -o /tmp/ml-32m.zip -d /tmp/ml-32m-extract
    for f in "${ML_MISSING[@]}"; do
        cp "/tmp/ml-32m-extract/ml-32m/${f}" "${SCRIPT_DIR}/${f}"
        echo "  ✓ ${f}"
    done
    rm -rf /tmp/ml-32m.zip /tmp/ml-32m-extract
fi

# --- TMDB All Movies ---
TMDB_FILE="${SCRIPT_DIR}/TMDB_all_movies.csv"
if [ -f "$TMDB_FILE" ]; then
    echo "✓ TMDB_all_movies.csv already exists, skipping."
else
    echo ""
    echo "TMDB dataset download (The Ultimate 1Million Movies Dataset):"
    echo "  https://www.kaggle.com/datasets/alanvourch/tmdb-movies-daily-updates"
    echo ""
    if command -v kaggle &>/dev/null; then
        echo "Kaggle CLI detected, downloading..."
        kaggle datasets download -d alanvourch/tmdb-movies-daily-updates -p /tmp/tmdb
        unzip -o /tmp/tmdb/*.zip -d /tmp/tmdb
        cp /tmp/tmdb/TMDB_all_movies.csv "$TMDB_FILE"
        rm -rf /tmp/tmdb
        echo "  ✓ TMDB_all_movies.csv"
    else
        echo "⚠ Manual download required for TMDB_all_movies.csv (694 MB)"
        echo "  Install kaggle CLI for automatic download: pip install kaggle"
    fi
fi

echo ""
echo "================================================================"
echo "Done. Cache .pkl files will be auto-generated when you run the"
echo "notebook for the first time."
echo "================================================================"
