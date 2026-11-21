# ⚙️ SalonBook — Backend Server

SalonBook Server is the REST API for a full-stack salon booking platform. It manages salon services, customer appointment requests, role-based access, Stripe payments, customer accounts, and successful transaction records.

The API works with the SalonBook Next.js client and uses MongoDB for application data and Better Auth session records.

## 🌐 Live Site

**URL:** [https://salon-book-nine.vercel.app](https://salon-book-nine.vercel.app/)

## 📦 Repositories

| Repository | Link |
| --- | --- |
| 🖥️ Client Repository | [https://github.com/HridoyAhmedRafi/salon-book](https://github.com/HridoyAhmedRafi/salon-book) |
| ⚙️ Server Repository | [https://github.com/HridoyAhmedRafi/salon-book-server](https://github.com/HridoyAhmedRafi/salon-book-server) |

## ✨ Backend Features

### 🔐 Authentication and Authorization

- **Better Auth session validation** — validates bearer session tokens stored in MongoDB.
- **User resolution** — loads the session owner and attaches the user to the request.
- **Customer access** — protects customer appointment and payment operations.
- **Admin access** — protects service, appointment, customer, transaction, and dashboard operations.
- **Role enforcement** — allows access only when the authenticated user has the required `customer` or `admin` role.

### 💈 Service Management

- **Public service browsing** — returns active salon services.
- **Service search** — searches services by name.
- **Category filtering** — filters services by category.
- **Price sorting** — sorts services from low to high or high to low.
- **Featured services** — returns recently added active services.
- **Admin service creation** — creates services with an active status.
- **Admin service editing** — updates service names, categories, descriptions, prices, durations, and images.
- **Service status control** — activates or deactivates services.
- **Service deletion** — removes services from MongoDB.

### 📅 Appointment Management

- **Appointment requests** — creates customer booking requests with pending status.
- **Duplicate slot protection** — prevents overlapping pending or confirmed requests for the same service, date, and time slot.
- **Customer appointments** — retrieves a customer's appointment history.
- **Customer cancellation** — allows customers to cancel pending appointments.
- **Admin appointment listing** — retrieves all appointment requests.
- **Appointment confirmation** — changes pending appointments to confirmed.
- **Appointment cancellation** — allows administrators to cancel pending or confirmed appointments.
- **Payment status tracking** — tracks appointments as unpaid or paid.

### 👥 Customer and Dashboard Management

- **Customer listing** — lists customer accounts and each customer's appointment count.
- **Block and unblock accounts** — changes the `isBlocked` status of customer users.
- **Dashboard metrics** — counts customers, active services, appointments, pending appointments, confirmed appointments, and paid appointments.
- **Transaction listing** — returns successful payment records in newest-first order.

### 💳 Stripe Payment Processing

- **Checkout sessions** — creates Stripe Checkout sessions for confirmed, unpaid appointments.
- **Ownership validation** — ensures a customer can pay only for their own appointment.
- **BDT payment conversion** — converts the appointment price from BDT to USD for Stripe Checkout.
- **Payment verification** — verifies Stripe Checkout sessions and updates paid appointments.
- **Webhook fulfillment** — verifies and processes `checkout.session.completed` events.
- **Transaction deduplication** — creates only one transaction record for each Stripe session.
- **Payment fallback** — can fulfill a successful payment from the verification endpoint if webhook processing has not already recorded it.

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js |
| Framework | Express.js 5 REST API |
| Database | MongoDB |
| Database Client | MongoDB Node.js driver |
| Authentication | Better Auth session records and bearer tokens |
| Payments | Stripe Checkout, Stripe SDK, and Stripe webhooks |
| Configuration | dotenv |
| Cross-Origin Requests | CORS |
| Module System | ES Modules |
| Deployment | Vercel Serverless Functions |

## 🔐 Authentication and Authorization

- Better Auth stores users and sessions in the MongoDB database `salon-book-db`.
- The session collection stores the bearer token used by the API.
- The server reads `Authorization: Bearer <token>` from protected requests.
- New customer accounts use the `customer` role.
- Administrators must be assigned the `admin` role in the Better Auth user document.
- Customer accounts may also include an `isBlocked` status.
- Protected API middleware validates the session, loads the user, and verifies the required role.
- The API does not currently check `isBlocked` during token verification.

## 🗄️ Database Structure

The server uses the MongoDB database `salon-book-db`.

| Collection | Purpose |
| --- | --- |
| `services` | Salon service details, pricing, duration, category, image, and status |
| `appointments` | Customer booking requests, statuses, and payment information |
| `user` | Better Auth users, roles, and blocked status |
| `session` | Better Auth sessions used for bearer-token validation |
| `transactions` | Successful Stripe payment records |

## 🌐 API Overview

### Public Routes

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Health/status response |
| `GET` | `/services` | Browse active services with search, category, and sorting |
| `GET` | `/featured-services` | Get recent featured active services |

### Authenticated Routes

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/services/:id` | Get a service by ID |
| `POST` | `/book-appointment` | Create an appointment request |
| `GET` | `/appointments/:customerId` | Get a customer's appointments |
| `PATCH` | `/appointments/:id/cancel` | Cancel a pending appointment |

### Customer Payment Routes

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/payments/create-checkout-session` | Create a Stripe Checkout session |
| `GET` | `/payments/verify-session/:sessionId` | Verify and fulfill a successful payment |

### Admin Routes

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/add-service` | Create a service |
| `GET` | `/admin/services` | Get all services |
| `PATCH` | `/services/:id` | Edit a service |
| `PATCH` | `/services/:id/status` | Activate or deactivate a service |
| `DELETE` | `/services/:id` | Delete a service |
| `GET` | `/admin/appointments` | Get all appointments |
| `PATCH` | `/admin/appointments/:id/status` | Confirm or cancel an appointment |
| `GET` | `/admin/users` | Get customer accounts and appointment counts |
| `PATCH` | `/admin/users/:id/status` | Block or unblock a customer |
| `GET` | `/admin/transactions` | Get successful payment transactions |
| `GET` | `/admin/dashboard-stats` | Get dashboard metrics |

### Stripe Webhook

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/webhooks/stripe` | Receive verified Stripe Checkout completion events |

## 🚀 Local Setup

### 1. Prerequisites

- Node.js 20 or later
- npm
- MongoDB
- A Stripe account
- A configured Stripe webhook endpoint

### 2. Clone the Server Repository

```bash
git clone https://github.com/HridoyAhmedRafi/salon-book-server.git
cd salon-book-server
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure the Server

Create a `.env` file in the project root:

```env
PORT=
MONGODB_URI=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CLIENT_URL=
```

| Variable | Description |
| --- | --- |
| `PORT` | Optional server port; defaults to `5000` |
| `MONGODB_URI` | MongoDB connection string used by the REST API |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `CLIENT_URL` | Client URL used for Stripe success and cancel redirects |

> [!IMPORTANT]
> Never commit real credentials, database URLs, API keys, or secret values.

### 5. Run the Server

```bash
node index.js
```

The server uses port `5000` by default.

Open [http://localhost:5000](http://localhost:5000) to verify the health/status response.

For local Stripe webhook testing, configure the checkout webhook to send events to:

```text
/webhooks/stripe
```

## 📜 Available Scripts

| Command | Description |
| --- | --- |
| `node index.js` | Start the Express server |

The server package currently does not define separate development or test scripts.

## 📁 Project Structure

```text
salon-book-server/
├── config/
│   └── stripe.js               # Stripe SDK configuration
├── index.js                    # Server setup, middleware, MongoDB collections, and API routes
├── vercel.json                 # Vercel serverless deployment configuration
├── package.json                # Node.js dependencies and package metadata
├── package-lock.json           # Locked dependency versions
└── .env                        # Local environment variables
```

## ☁️ Deployment

The server is configured for Vercel Serverless deployment through `vercel.json`.

- Build source: `index.js`
- Runtime: `@vercel/node`
- All incoming paths are routed to `index.js`.
- Configure all required environment variables in the Vercel project settings.
- Set `CLIENT_URL` to the deployed frontend URL.

## ⚠️ Implementation Notes

- Appointment ownership should be verified consistently against the authenticated user's ID.
- The `GET /appointments/:customerId` route should not rely on the URL parameter alone for authorization.
- The appointment cancellation route accepts a customer ID in the request body.
- The API has no automated test suite or dedicated test script.
- The server currently uses a monolithic structure, with routes and MongoDB operations located in `index.js`.
