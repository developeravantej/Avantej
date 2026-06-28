#!/usr/bin/env bash
# Assemble the static-asset bundle for the UAT review Worker:
#   public/index.html        <- _e2e/review-uat.html
#   public/results/art-*/...  <- recorded videos referenced by the page
# Run from repo root: bash _e2e/review-worker/build.sh
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
E2E="$(cd "$HERE/.." && pwd)"
PUB="$HERE/public"

rm -rf "$PUB"
mkdir -p "$PUB/results"
cp "$E2E/review-uat.html" "$PUB/index.html"

# Copy only the per-batch artifact dirs the page references (videos live here).
shopt -s nullglob
for d in "$E2E"/results/art-*; do
  cp -r "$d" "$PUB/results/"
done

# Transcode the embedded (>=10KB) recordings to faststart MP4 so they play over a
# plain GET (Cloudflare assets don't serve Range; webm needs Range -> spinner).
# Blank API-spec recordings (<10KB) aren't referenced — skip them. Then drop webm.
n=0
while IFS= read -r w; do
  mp4="${w%.webm}.mp4"
  ffmpeg -y -loglevel error -i "$w" -movflags +faststart -c:v libx264 -pix_fmt yuv420p -an "$mp4" </dev/null && n=$((n+1))
  # Poster = a frame ~1.5s before the end (the settled, rendered page) so the
  # player shows the actual UI instead of the black first frame.
  ffmpeg -y -loglevel error -sseof -1.5 -i "$mp4" -frames:v 1 -q:v 4 "${w%.webm}.jpg" </dev/null 2>/dev/null \
    || ffmpeg -y -loglevel error -i "$mp4" -frames:v 1 -q:v 4 "${w%.webm}.jpg" </dev/null 2>/dev/null
done < <(find "$PUB/results" -name "*.webm" -size +10k)
find "$PUB/results" -name "*.webm" -delete

vids=$(find "$PUB/results" -name "*.mp4" | wc -l)
size=$(du -sh "$PUB" | cut -f1)
echo "public/ assembled: $vids MP4 videos ($n transcoded), $size total"
