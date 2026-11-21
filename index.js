import express from 'express'
import cors from 'cors'
import 'dotenv/config'
// import dotenv from "dotenv";
import { MongoClient, ObjectId } from 'mongodb'
import stripe from "./config/stripe.js"
// dotenv.config();
export const config = {
    api: {
        bodyParser: false,
    },
}

const PORT = process.env.PORT || 5000

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
const transactions = db.collection("transactions")
const sessions = db.collection("session")

await transactions.createIndex(
    { stripeSessionId: 1 },
    { unique: true }
)
console.log("Transaction unique index created.")

export async function fulfillPayment(session) {
    if (!session || session.payment_status !== "paid") {
        return { success: false, reason: "Payment status is not paid" }
    }

    const { appointmentId, customerId } = session.metadata || {}

    if (!appointmentId || !customerId || !ObjectId.isValid(appointmentId)) {
        console.error("Invalid session metadata:", session.metadata)
        return { success: false, reason: "Invalid session metadata" }
    }

    // 1. Check if transaction already exists for this stripe session
    const existingTransaction = await transactions.findOne({
        stripeSessionId: session.id,
    })

    if (existingTransaction) {
        return { success: true, message: "Transaction already exists" }
    }

    // 2. Find confirmed appointment belonging to the customer
    const appointment = await appointments.findOne({
        _id: new ObjectId(appointmentId),
        customerId: customerId,
        Status: "Confirmed",
    })

    if (!appointment) {
        console.error("Appointment not found or not confirmed for session:", session.id)
        return { success: false, reason: "Appointment not found or not confirmed" }
    }

    // 3. Update appointment PaymentStatus to Paid
    if (appointment.PaymentStatus !== "Paid") {
        await appointments.updateOne(
            {
                _id: appointment._id,
                customerId: customerId,
                Status: "Confirmed",
            },
            {
                $set: {
                    PaymentStatus: "Paid",
                },
            }
        )
    }

    // 4. Safely insert transaction document in BDT
    try {
        await transactions.insertOne({
            appointmentId: appointment._id.toString(),
            customerId: appointment.customerId,
            customerName: appointment.customerName,
            customerEmail: appointment.customerEmail,
            serviceName: appointment.serviceName,
            appointmentDate: appointment.appointmentDate,
            amount: appointment.price, // BDT amount preserved
            currency: "BDT",
            stripeSessionId: session.id,
            status: "Paid",
            transactionDate: new Date(),
        })
        console.log(`Payment fulfilled successfully for appointment ${appointmentId}`)
    } catch (error) {
        if (error.code === 11000) {
            console.log(`Duplicate transaction prevented for session ${session.id}`)
        } else {
            console.error("Failed to insert transaction:", error)
            throw error
        }
    }

    return { success: true }
}

const app = express()

// Webhook route registered BEFORE global express.json() with express.raw()
app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        const signature = req.headers["stripe-signature"]

        if (!signature) {
            return res.status(400).send({
                message: "Missing stripe-signature header",
            })
        }

        const payload = Buffer.isBuffer(req.body)
            ? req.body
            : req.rawBody
                ? req.rawBody
                : typeof req.body === "string"
                    ? req.body
                    : null

        if (!payload) {
            return res.status(400).send({
                message: "Missing webhook payload",
            })
        }

        let event

        try {
            event = stripe.webhooks.constructEvent(
                payload,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            )
        } catch (error) {
            console.error("Webhook signature verification failed:", error.message)

            return res.status(400).send({
                message: "Invalid webhook signature",
            })
        }

        console.log("Stripe event received:", event.type)

        if (event.type === "checkout.session.completed") {
            const session = event.data.object

            if (session.payment_status === "paid") {
                try {
                    await fulfillPayment(session)
                } catch (err) {
                    console.error("Error fulfilling payment from webhook:", err)
                    return res.status(500).send({
                        message: "Error fulfilling payment",
                    })
                }
            }
        }

        return res.status(200).send({
            received: true,
        })
    }
)

app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf
        },
    })
)
app.use(cors())

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        res.status(401).send({
            message: "Unauthorized"
        });
        return;
    }

    const token = authHeader.split(" ")[1]
    if (!token) {
        res.status(401).send({ message: 'Unauthorized' })
        return
    }

    const query = { token }
    const session = await sessions.findOne(query)
    if (!session) {
        res.status(401).send({ message: 'Unauthorized' })
        return
    }
    const userId = session.userId
    const userQuery = { _id: new ObjectId(userId) }
    const user = await users.findOne(userQuery)
    if (!user) {
        res.status(401).send({ message: 'Unauthorized' })
        return
    }

    req.user = user
    next()
}
//verifyCustomer
const verifyCustomer = (req, res, next) => {
    if (req.user.role !== 'customer') {
        res.status(401).send({ message: "Forbidden" })
        return
    }
    next()
}
//verifyAdmin
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        res.status(401).send({ message: "Forbidden" })
        return
    }
    next()
}

//payment related
const BDT_TO_USD_RATE = 122;
app.post(
    "/payments/create-checkout-session",
    verifyToken,
    verifyCustomer,
    async (req, res) => {

        try {
            // Get appointment ID
            const { appointmentId } = req.body;

            if (!appointmentId) {
                return res.status(400).send({
                    message: "Appointment ID is required",
                });
            }
            // Validate appointment ID
            if (!ObjectId.isValid(appointmentId)) {
                return res.status(400).send({
                    message: "Invalid appointment ID",
                });
            }

            // Find appointment
            const appointment = await appointments.findOne({
                _id: new ObjectId(appointmentId),
            });

            if (!appointment) {
                return res.status(404).send({
                    message: "Appointment not found",
                });
            }

            // Verify appointment ownership
            if (appointment.customerId !== req.user._id.toString()) {
                return res.status(403).send({
                    message: "You are not allowed to pay for this appointment",
                });
            }

            // Check appointment status
            if (appointment.Status !== "Confirmed") {
                return res.status(400).send({
                    message: "Only confirmed appointments can be paid",
                });
            }

            // Check payment status
            if (appointment.PaymentStatus === "Paid") {
                return res.status(400).send({
                    message: "This appointment has already been paid",
                });
            }

            // Validate appointment price
            if (
                typeof appointment.price !== "number" ||
                !Number.isFinite(appointment.price) ||
                appointment.price <= 0
            ) {
                return res.status(400).send({
                    message: "Invalid appointment price",
                });
            }

            // Convert BDT to USD
            const amountInUSD = appointment.price / BDT_TO_USD_RATE;
            const stripeAmount = Math.round(amountInUSD * 100);

            const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

            // Create Stripe Checkout Session
            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                metadata: {
                    appointmentId: appointment._id.toString(),
                    customerId: appointment.customerId,
                },
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: {
                                name: appointment.serviceName,
                            },
                            unit_amount: stripeAmount,
                        },
                        quantity: 1,
                    },
                ],
                success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${clientUrl}/payment/cancel`,
            });
            console.log("Stripe Checkout URL:", session.url);
            console.log("Stripe Session ID:", session.id);
            console.log("Stripe Session Status:", session.status);
            return res.send({
                url: session.url,
            });


        } catch (error) {
            console.error("Payment error:", error);

            return res.status(500).send({
                message: "Failed to create checkout session",
            });
        }
    }
);

app.get(
    "/payments/verify-session/:sessionId",
    verifyToken,
    verifyCustomer,
    async (req, res) => {
        try {
            const { sessionId } = req.params;

            if (!sessionId || typeof sessionId !== "string") {
                return res.status(400).send({
                    paid: false,
                    message: "Invalid session ID.",
                });
            }

            // 1. Check existing transaction in DB
            const transaction = await transactions.findOne({
                stripeSessionId: sessionId,
                customerId: req.user._id.toString(),
                status: "Paid",
            });

            if (transaction) {
                return res.send({
                    paid: true,
                    message: "Payment verified successfully.",
                });
            }

            // 2. Fallback: Retrieve session directly from Stripe API
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (!session) {
                return res.status(404).send({
                    paid: false,
                    message: "Checkout session not found.",
                });
            }

            // Verify customer ownership
            if (session.metadata?.customerId !== req.user._id.toString()) {
                return res.status(403).send({
                    paid: false,
                    message: "Unauthorized payment session.",
                });
            }

            if (session.payment_status === "paid") {
                const result = await fulfillPayment(session);

                if (result.success) {
                    return res.send({
                        paid: true,
                        message: "Payment verified and recorded successfully.",
                    });
                } else {
                    return res.status(400).send({
                        paid: false,
                        message: result.reason || "Could not fulfill payment.",
                    });
                }
            }

            return res.status(202).send({
                paid: false,
                message: "Payment is still processing.",
            });
        } catch (error) {
            console.error("Payment verification error:", error);

            return res.status(500).send({
                paid: false,
                message: "Failed to verify payment.",
            });
        }
    }
);


app.get('/', (req, res) => {
    res.send({ message: "API is running " })
})

// payment/transaction get api
app.get(
    "/admin/transactions",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
        try {
            const result = await transactions
                .find()
                .sort({ transactionDate: -1 })
                .toArray();

            return res.send(result);
        } catch (error) {
            console.error("Get transactions error:", error);

            return res.status(500).send({
                message: "Failed to fetch transactions",
            });
        }
    }
);

// services apis
app.post('/add-service', verifyToken, verifyAdmin, async (req, res) => {
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

app.get('/services/:id', verifyToken, async (req, res) => {
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
app.get('/admin/services', verifyToken, verifyAdmin, async (req, res) => {
    const result = await services
        .find({})
        .sort({ postedAt: -1 })
        .toArray();

    res.send(result);
});

app.patch('/services/:id', verifyToken, verifyAdmin, async (req, res) => {
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

app.patch('/services/:id/status', verifyToken, verifyAdmin, async (req, res) => {
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

app.delete('/services/:id', verifyToken, verifyAdmin, async (req, res) => {
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

//customer appoinment apis
app.post('/book-appointment', verifyToken, verifyCustomer, async (req, res) => {
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

app.get('/appointments/:customerId', verifyToken, verifyCustomer, async (req, res) => {
    const result = await appointments
        .find({ customerId: req.params.customerId })
        .toArray();
    res.send(result);
})

app.patch('/appointments/:id/cancel', verifyToken, verifyCustomer, async (req, res) => {
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
app.get('/admin/appointments', verifyToken, verifyAdmin, async (req, res) => {
    const result = await appointments
        .find({})
        .sort({ _id: -1 })
        .toArray()
    res.send(result)
})

// admin confirm or cancel an appointment
app.patch('/admin/appointments/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params
    const { status } = req.body

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid appointment id." })
    }
    if (status !== "Confirmed" && status !== "Cancelled") {
        return res.status(400).send({
            message: "Status must be either Confirmed or Cancelled.",
        })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
        return res.status(404).send({ message: "Appointment not found." })
    }

    if (status === "Confirmed" && appointment.Status !== "Pending") {
        return res.status(409).send({
            message: `A ${appointment.Status.toLowerCase()} appointment cannot be confirmed.`,
        })
    }
    if (
        status === "Cancelled" &&
        appointment.Status !== "Pending" &&
        appointment.Status !== "Confirmed"
    ) {
        return res.status(409).send({
            message: `A ${appointment.Status.toLowerCase()} appointment cannot be cancelled.`,
        })
    }

    await appointments.updateOne(
        { _id: appointment._id },
        { $set: { Status: status } },
    )

    res.send({ message: `Appointment ${status.toLowerCase()}.` })
})

// admin customer list
app.get('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    const customers = await users
        .find({ role: "customer" })
        .sort({ _id: -1 })
        .toArray()

    const appointmentCounts = await appointments
        .aggregate([
            { $group: { _id: "$customerId", count: { $sum: 1 } } },
        ])
        .toArray()

    const countByCustomer = new Map(
        appointmentCounts.map(({ _id, count }) => [String(_id), count]),
    )

    res.send(
        customers.map((customer) => ({
            _id: customer._id,
            name: customer.name,
            email: customer.email,
            image: customer.image ?? null,
            role: customer.role,
            isBlocked: customer.isBlocked ?? false,
            createdAt: customer.createdAt,
            appointmentCount:
                countByCustomer.get(customer._id.toString()) ?? 0,
        })),
    )
})

// admin block or unblock a customer
app.patch('/admin/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params
    const { isBlocked } = req.body

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id." })
    }
    if (typeof isBlocked !== "boolean") {
        return res.status(400).send({
            message: "isBlocked must be a boolean.",
        })
    }

    const user = await users.findOne({ _id: new ObjectId(id) })
    if (!user) {
        return res.status(404).send({ message: "User not found." })
    }
    if (user.role !== "customer") {
        return res.status(400).send({
            message: "Only customer accounts can be blocked.",
        })
    }
    await users.updateOne(
        { _id: user._id },
        { $set: { isBlocked } },
    )
    res.send({
        message: isBlocked ? "Customer blocked." : "Customer unblocked.",
    })
})

// dashboard stats
app.get("/admin/dashboard-stats", verifyToken, verifyAdmin, async (req, res) => {
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



app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`)
})

export default app