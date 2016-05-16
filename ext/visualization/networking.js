/*
 * Copyright 2016 ETH Zurich
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function(root) {
    // Set-up the NameSpace
    root.chromeNetworking = new (function() {
        var NoAddressException = "No Address";
        var NotConnectedException = "Not Connected";

        var socket = chrome.sockets.udp;

        var baseClient = function() {
            var address, port;
            var socketInfo;
            var connected = false;
            var callbacks = [];
            var self = this;

            this.connect = function(inAddress, inPort, callback,
                    responseHandler) {
                if (!!inAddress == false)
                    throw NoAddressException;

                address = inAddress;
                port = inPort || this.defaultPort;

                var sockProp = chrome.sockets.udp.SocketProperties;
                sockProp = {
                    bufferSize : 65536
                };

                console.log('creating socket', address, port);

                socket.create(sockProp, function(_socketInfo) {
                    socketInfo = _socketInfo;

                    socket.bind(socketInfo.socketId, address, 0, function(
                            connectResult) {
                        connected = (connectResult == 0);

                        socket.onReceive.addListener(function(result) {
                            updateUiUdpRecv(result.data);
                            if (callbacks.length > 0) {
                                callbacks.shift()(result);
                            }
                        });

                        callback(connected);
                    });
                });
            };

            this.send = function(data, callback) {
                callback = callback || function() {
                };
                if (!!address == false)
                    throw NoAddressException;
                if (connected == false)
                    throw NotConnectedException;

                updateUiUdpSent(data);
                socket.send(socketInfo.socketId, data, address, port, function(
                        sendResult) {
                    callback(sendResult);
                });
            };

            this.receive = function(callback) {
                if (!!address == false)
                    throw NoAddressException;
                if (connected == false)
                    throw NotConnectedException;
                callbacks.push(callback);
            };

            this.disconnect = function() {
                if (!!address == false)
                    throw NoAddressException;
                if (connected == false)
                    throw NotConnectedException;

                socket.close(socketInfo.socketId, function() {
                    connected = false;
                });
            };
        };

        var _EchoClient = function(defaultPort) {
            return function() {
                var client = new baseClient();
                this.defaultPort = defaultPort;

                this.connect = client.connect;
                this.disconnect = client.disconnect;

                this.callbacks = {};
                this.echo = function(data, callback) {
                    if (!this.callbacks[data]) {
                        this.callbacks[data] = [];
                    }
                    this.callbacks[data].push(callback);
                    var self = this;
                    client.send(data, function(sendResult) {
                        client.receive(function(receiveResult) {
                            var u32 = new Uint8Array(receiveResult.data);
                            var m = u32[0];
                            var cbs = self.callbacks[m];
                            if (cbs) {
                                cb = cbs.shift();
                                if (cb) {
                                    cb(receiveResult);
                                }
                            }
                        });
                    });
                };
            };
        };

        return {
            // Clients
            clients : {
                echoClient : _EchoClient(7)
            },
            // Exceptions
            exceptions : {
                NoAddressException : NoAddressException,
                NotConnectedException : NotConnectedException
            }
        };
    })();
})(this);
