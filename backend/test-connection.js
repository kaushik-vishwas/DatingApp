const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

console.log('Testing connection to:', uri);

async function testConnection() {
    try {
        const client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 10000,
            family: 4,
        });
        
        await client.connect();
        console.log('✅ Connected successfully!');
        
        const admin = client.db('admin');
        const result = await admin.command({ isMaster: 1 });
        console.log('✅ Server info:', {
            hosts: result.hosts,
            setName: result.setName,
            primary: result.primary
        });
        
        await client.close();
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        
        // Try to extract hostname for manual resolution
        const match = uri.match(/@([^\/?]+)/);
        if (match) {
            console.log(`\nTry pinging: ${match[1]}`);
        }
    }
}

testConnection();