import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
app.use(express.json())
app.use(cors())
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


const mongoClient = await connectToMongoDB()
const db = mongoClient.db("salon-book-db")
const services = db.collection("services")

// services apis
app.post('/add-service', async (req, res) => {
    const service = {
        ...req.body,
        status: "active",
        postedAt: new Date().toISOString().slice(0, 10)
    }
    const result = await services.insertOne(service)
    res.send(result)
})


app.get('/', (req, res) => {
    res.send({ message: "API is running " })
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
})