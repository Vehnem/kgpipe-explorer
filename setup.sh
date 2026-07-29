#!/bin/bash

set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# python
echo '3.12' > .python.version
[[ ! -d ".venv" ]] && uv venv
source .venv/bin/activate

# kgpipe config
mkdir -p ~/.kgconf/
echo '
SYS_KG_URL: "sparql://localhost:18890/sparql-auth"
SYS_KG_USR: "dba"
SYS_KG_PSW: "mysecret"
' > ~/.kgconf/kgpipe.yaml

# virtuoso
docker ps | grep 'kgpipe_virtdb' || docker run -d \
    --name kgpipe_virtdb \
    --interactive \
    --tty \
    --env DBA_PASSWORD=mysecret \
    --publish 1111:1111 \
    --publish  18890:8890 \
    openlink/virtuoso-opensource-7:latest

# kgpipe
[[ ! -d "KGpipe" ]] && git clone -b demo-fixes git@github.com:ScaDS/KGpipe.git && cd KGpipe/ && uv pip install -e .[ml,cpu]
kgpipe discover --all
kgpipe run KGpipe/experiments/moviekg/pipeline.conf --all --dry-run

# demo app
[[ ! -d "kgpipe-explorer" ]] && git clone git@github.com:Vehnem/kgpipe-explorer.git

# data (in backend dir)
cd $BASE_DIR/kgpipe-explorer/backend/
mkdir -p data
cd data
[[ ! -f "results.tgz" ]] && wget -O results.tgz https://zenodo.org/records/20591150/files/inc_movie_kg_results.tar.gz\?download\=1
[[ ! -d "results" ]] && tar xzvf results.tgz



