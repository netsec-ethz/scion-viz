# SCION AS Visualization

These are temporary instructions until the appropriate place is located on an updated deployment server. Some or all of these tools may end up migrating to another repository if need be.

1. Clone [scion](https://github.com/netsec-ethz/scion) and submodules to an appropriate local dir like `$GOPATH/src/github.com/netsec-ethz/scion`.
1. Execute the install update script:

    ```
    ./oneclick_install.sh
    ```

This will add a new directory `sub/scion-viz` under the scion root directory and clone/update the scion-viz repo and launch the Django web service for the AS Visualization at 0.0.0.0:8080. Feel free to modify the script's scion root directory and/or IP address and port as desired.

To run command-line (paths example, use -h for help):

    ```
    python3 python/as_viewer.py 1-14 2-23 -p
    ```

To run Django web UI at default localhost 127.0.0.1:8000 use:

    ```
    python3 python/web/manage.py runserver
    ```
