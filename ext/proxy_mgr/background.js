// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This file initializes the background page by loading a
 *               ProxyErrorHandler, and resetting proxy settings if required.
 * 
 * @author Mike West <mkwst@google.com>
 * @author mwfarb@cmu.edu (Michael Farb): Added SCION proxy settings.
 */

var VIZ_APP_ID = "bogdaeienjhpdgpnmhenbgkjkglcbdok";

document.addEventListener("DOMContentLoaded", function() {
    var errorHandler = new ProxyErrorHandler();

    // If this extension has already set the proxy settings, then reset it
    // once as the background page initializes. This is essential, as
    // incognito settings are wiped on restart.
    var persistedSettings = ProxyFormController.getPersistedSettings();
    if (persistedSettings !== null) {
        chrome.proxy.settings.set({
            'value' : persistedSettings.regular
        });
    }
});

chrome.runtime.onMessageExternal.addListener(function(request, sender,
        sendResponse) {
    if (sender.id == VIZ_APP_ID) {
        console.log(JSON.stringify(request));
        // incoming request for proxy settings from visualization app
        if (request.getProxyAddress) {
            chrome.proxy.settings.get({
                'incognito' : false
            }, function(config) {
                console.log(JSON.stringify(config));
                var c = config.value;
                var proxyAddr = null;
                if (c.mode === 'fixed_servers' && c.rules
                        && c.rules.singleProxy) {
                    proxyAddr = c.rules.singleProxy.host;
                }
                sendResponse({
                    proxyAddress : proxyAddr
                });
            });
        }
        return true;
    }
});
