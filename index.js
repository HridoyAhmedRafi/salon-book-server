import express from 'express'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 5000

import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}


const mongoClient = connectToMongoDB()
const db = mongoClient.db("salon-book-db")

app.get('/', (req, res) => {
    res.send({ message: "API is running " })
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
})