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
const users = db.collection("user")

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

// admin services apis
app.get('/admin/services', async (req, res) => {
    const result = await services
        .find({})
        .sort({ postedAt: -1 })
        .toArray();

    res.send(result);
});

app.patch('/services/:id', async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid service id." })
    }

    const editableFields = [
        "serviceName",
        "category",
        "description",
        "price",
        "duration",
        "image",
    ]
    const updates = {}

    for (const field of editableFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field]
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).send({ message: "No fields to update." })
    }

    const hasEmptyText = [
        "serviceName",
        "category",
        "description",
        "image",
    ].some((field) => updates[field] !== undefined && !String(updates[field]).trim())

    if (hasEmptyText) {
        return res.status(400).send({ message: "Text fields cannot be empty." })
    }

    const hasInvalidNumber =
        (updates.price !== undefined &&
            (typeof updates.price !== "number" || updates.price < 0)) ||
        (updates.duration !== undefined &&
            (typeof updates.duration !== "number" || updates.duration < 1))

    if (hasInvalidNumber) {
        return res.status(400).send({
            message: "Price and duration must be valid numbers.",
        })
    }

    const result = await services.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates },
    )

    if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Service not found." })
    }

    res.send({ message: "Service updated." })
})

app.patch('/services/:id/status', async (req, res) => {
    const { id } = req.params
    const { status } = req.body

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid service id." })
    }

    if (status !== "active" && status !== "inactive") {
        return res.status(400).send({
            message: "Status must be 'active' or 'inactive'.",
        })
    }

    const result = await services.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } },
    )

    if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Service not found." })
    }
    res.send({
        message:
            status === "active"
                ? "Service activated."
                : "Service deactivated.",
        status,
    })
})

app.delete('/services/:id', async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid service id." })
    }

    const result = await services.deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Service not found." })
    }

    res.send({ message: "Service deleted." })
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

app.get('/appointments/:customerId', async (req, res) => {
    const result = await appointments
        .find({ customerId: req.params.customerId })
        .toArray();
    res.send(result);
})

app.patch('/appointments/:id/cancel', async (req, res) => {
    const { id } = req.params
    const { customerId } = req.body

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid appointment id." })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })

    if (!appointment) {
        return res.status(404).send({ message: "Appointment not found." })
    }

    if (appointment.customerId !== customerId) {
        return res.status(403).send({ message: "You can only cancel your own appointments." })
    }

    if (appointment.Status !== "Pending") {
        return res.status(409).send({
            message: `A ${appointment.Status.toLowerCase()} appointment cannot be cancelled.`,
        })
    }

    await appointments.updateOne(
        { _id: appointment._id },
        { $set: { Status: "Cancelled" } },
    )

    res.send({ message: "Appointment cancelled." })
})

// admin appointment list
app.get('/admin/appointments', async (req, res) => {
    const result = await appointments
        .find({})
        .sort({ _id: -1 })
        .toArray()

    res.send(result)
})

// dashboard stats
app.get("/admin/dashboard-stats", async (req, res) => {
    const totalCustomers = await users.countDocuments({
        role: "customer",
    });
    const activeServices = await services.countDocuments({
        status: "active",
    });

    const totalAppointments = await appointments.countDocuments();
    const pendingAppointments = await appointments.countDocuments({
        Status: "Pending",
    });
    const confirmedAppointments = await appointments.countDocuments({
        Status: "Confirmed",
    });
    const successfulPayments = await appointments.countDocuments({
        PaymentStatus: "Paid",
    });

    res.send({
        totalCustomers,
        activeServices,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        successfulPayments,
    });
});

app.get('/', (req, res) => {
    res.send({ message: "API is running " })
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
})