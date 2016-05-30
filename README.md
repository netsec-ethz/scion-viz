# SCION Chrome Proxy Visualization Extensions

To install in Chrome (one time):

1. Open the Chrome browser.
1. Go to [chrome://extensions](chrome://extensions).
1. **Developer mode** should be checked.
1. Click **Load unpacked extension...**
1. Select the local directory of the SCION Proxy Manager extension: `ext/proxy_mgr`
1. Click **Load unpacked extension...** again.
1. Select the local directory of the SCION Visualization app: `ext/visualization`
1. Click on the SCION Proxy Manager extension button to the right of the address window.
1. Select **Use SCION proxy settings**, settings will begin automatically.

To launch the proxy and knowledge-base (each run):

1. If running SCION, stop it: `./scion.sh stop`
1. Be sure the socket library is built: `./scion.sh build bypass`
1. For wide topology, update it if desired: `./scion.sh topology zkclean -c topology/Wide.topo`
1. Run SCION: `./scion.sh run`
1. Start 4 processes in separate terminals:
1. `./scion.sh sock_cli 1 4`
1. `./scion.sh sock_ser 3 3`
1. `endhost/scion_proxy.py -f -s -k`
1. `endhost/scion_proxy.py -p 9090 -s -k`
1. Launch the SCION Visualization app by opening a new tab and clicking on the Apps button in the top left of the window. This can also be done by going to [chrome://apps](chrome://apps).
1. Click on any URL in the SCION Visualization app window to view SCION statistics.
