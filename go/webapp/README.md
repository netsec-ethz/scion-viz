# SCIONLab Go Static Tester
==============

These are instructions for setting up this repo within the scion infrastructure to view visual web results from an AS deployment or test environment.


## webapp

To run the Go Web UI at default localhost 127.0.0.1:8000 use:

```shell
go run webapp/webapp.go
```

To run the Go Web UI at a specific address and port like 10.2.0.15:8080 and set the file browser to start form the local directory use:

```shell
go run webapp/webapp.go -a 10.2.0.15 -p 8080 -r .
```

Supported client applications include imagefetcher, sensorfetcher, and bwtester, instructions to setup the servers are `here`, and the web interface launched above can be used to run the client side apps.

This Go web server wraps several SCION test client apps and provides an interface for any text and/or image output received. <a  href='http://github.com/perrig/scionlab'>SCIONLab Apps</a> are on  Github.

Two functional client/server tests are included to test the networks without needed specific sensor or camera hardware. `imagetest` and `statstest`.


## statstest

```shell
python3 local-stats.py | go run stats-test-server.go -s 1-15,[127.0.0.5]:35555
```

![Alt text](static/img/statstest.png?raw=true "Title")


## imagetest

```shell
go run local-image.go | go run img-test-server.go -s 1-18,[127.0.0.8]:38888
```

![Alt text](static/img/imagetest.png?raw=true "Title")
