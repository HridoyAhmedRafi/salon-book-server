import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
app.use(express.json())
app.use(cors())
const PORT = process.env.PORT || 5000

import { MongoClient, ObjectId } from 'mongodb';

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
const appointments = db.collection("appointments")

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

app.get("/services", async (req, res) => {
    const { search, category, sort } = req.query;

    const filter = {
        status: "active",
    };
    if (search) {
        filter.serviceName = {
            $regex: search,
            $options: "i",
        };
    }
    if (category) {
        filter.category = category;
    }
    const sortOption = {};

    if (sort === "low-to-high") {
        sortOption.price = 1;
    } else if (sort === "high-to-low") {
        sortOption.price = -1;
    }
    const result = await services
        .find(filter)
        .sort(sortOption)
        .toArray();

    res.send(result);
});

app.get('/services/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) }
    const result = await services.findOne(query)
    res.send(result)
})

app.get('/featured-services', async (req, res) => {
    const result = await services
        .find({ status: "active" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

    res.send(result);
})

// appoinment apis
app.post('/book-appointment', async (req, res) => {
    const existingAppointment = await appointments.findOne({
        serviceId: req.body.serviceId,
        appointmentDate: req.body.appointmentDate,
        timeSlot: req.body.timeSlot,
        Status: { $in: ["Pending", "Confirmed"] },
    });

    if (existingAppointment) {
        return res.status(409).send({
            message: "This time & date slot is already booked.",
        });
    }

    const appointment = {
        ...req.body,
        Status: "Pending",
        PaymentStatus: "Unpaid",
        postedAt: new Date().toISOString().slice(0, 10)
    }
    const result = await appointments.insertOne(appointment)
    res.send(result)
})

app.get('/', (req, res) => {
    res.send({ message: "API is running " })
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
})