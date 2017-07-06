#!/bin/bash
set -e

cd "$GOPATH/src/github.com/netsec-ethz/scion"

# visualization install specific
cd sub
# TODO (mwfarb): update to netsec-ethz/scion-viz repo after merge
if cd scion-viz
    then
        git pull
    else
        git clone https://github.com/mwfarb/scion-viz.git
        cd scion-viz
fi
git checkout as_viewer
cd python/web
pip3 install --user --require-hashes -r requirements.txt
python3 ./manage.py migrate
python3 ./manage.py runserver 0.0.0.0:8080
