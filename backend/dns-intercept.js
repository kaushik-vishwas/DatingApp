// dns-intercept.js - Place this in your backend folder
const dns = require('dns');
const dnsPromises = dns.promises;

console.log('🔥 Installing DNS interceptors...');

// Intercept callback-based SRV resolution
const originalResolveSrv = dns.resolveSrv;
dns.resolveSrv = function(hostname, callback) {
    console.log('📞 Callback SRV request:', hostname);
    if (hostname === '_mongodb._tcp.cluster0.aswdhov.mongodb.net') {
        console.log('✅ Intercepted! Returning hardcoded addresses');
        const addresses = [
            { name: 'cluster0-shard-00-00.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
            { name: 'cluster0-shard-00-01.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
            { name: 'cluster0-shard-00-02.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 }
        ];
        return callback(null, addresses);
    }
    return originalResolveSrv(hostname, callback);
};

// Intercept promises-based SRV resolution (mongoose uses this)
const originalPromisesResolveSrv = dnsPromises.resolveSrv;
dnsPromises.resolveSrv = async function(hostname) {
    console.log('📞 Promises SRV request:', hostname);
    if (hostname === '_mongodb._tcp.cluster0.aswdhov.mongodb.net') {
        console.log('✅ Intercepted! Returning hardcoded addresses');
        return [
            { name: 'cluster0-shard-00-00.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
            { name: 'cluster0-shard-00-01.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 },
            { name: 'cluster0-shard-00-02.aswdhov.mongodb.net', port: 27017, priority: 10, weight: 10 }
        ];
    }
    return originalPromisesResolveSrv(hostname);
};

// Also override the global DNS lookup
const originalLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = { family: 4 };
    }
    if (!options) options = { family: 4 };
    options.family = 4;
    console.log('🌐 DNS lookup:', hostname);
    return originalLookup(hostname, options, callback);
};

console.log('✅ DNS interceptors installed successfully!');

// Now import and run your server
require('./dist/server.js');