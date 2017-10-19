#!/bin/bash
set -e

cd "$GOPATH/src/github.com/netsec-ethz/scion"

# visualization install specific
cd sub
if cd scion-viz
    then
        git pull
    else
        git clone https://github.com/netsec-ethz/scion-viz.git
        cd scion-viz
fi
git checkout master
cd python/web
pip3 install --user --require-hashes -r requirements.txt
python3 ./manage.py migrate
python3 ./manage.py runserver 0.0.0.0:8080
