# SCION AS Visualization

These are temporary instructions until the appropriate place is located on an updated deployment server. Some or all of these tools may end up migrating to another repository if need be.

1. Clone [scion](https://github.com/netsec-ethz/scion) and submodules to an appropriate local dir. 
1. Complete [scion-web](https://github.com/netsec-ethz/scion-web) setup instructions for scion/sub/web. 
1. `cd scion/sub`
1. `git clone https://github.com/mwfarb/scion-viz.git`
1. `cd scion-viz`
1. `git pull origin as_viewer`
1. `cd ../..`

To run command-line (paths example, use -h for help):

    ```
    python3 sub/scion-viz/python/as_viewer.py 1-14 2-23 -p
    ```

To run Django web UI:

    ```
    python3 sub/scion-viz/python/web/manage.py runserver
    ```
