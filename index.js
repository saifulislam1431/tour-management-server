require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '', credentials: true }));
app.use(express.json());

// MongoDB Connection URL
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function run() {
    try {
        // Connect to MongoDB
        await client.connect();
        console.log("Connected to MongoDB");
        const db = client.db('travelWallet');
        const userCollection = db.collection('users');
        const tourCollection = db.collection('tours');

        // User Registration
        app.post('/api/v1/register', async (req, res) => {
            const { userName, email, password, profile } = req.body;

            // Check if email already exists
            const existingUser = await userCollection.findOne({ email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'User already exists'
                });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert user into the database
            await userCollection.insertOne({ userName, email, profile, password: hashedPassword });

            res.status(201).json({
                success: true,
                message: 'User registered successfully'
            });
        });

        // User Login
        app.post('/api/v1/login', async (req, res) => {
            const { email, password } = req.body;

            // Find user by email
            const user = await userCollection.findOne({ email });
            if (!user) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            // Compare hashed password
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            const result = user;;

            res.json({
                success: true,
                message: 'Login successful',
                result: {
                    email: result?.email,
                    userName: result?.userName,
                    _id: result?._id,
                    profile: result?.profile,
                }
            });
        });

        // Tours
        app.post("/api/v1/tours", async (req, res) => {
            try {
                const data = req.body;
                const result = await tourCollection.insertOne(data);
                return res.json({
                    success: true,
                    message: "Created Successfully!",
                    insertedId: result?.insertedId
                })
            } catch (error) {
                return res.status(400).json({ message: "Something wrong!" })
            }
        })

        app.get("/api/v1/tours/:email", async (req, res) => {
            try {
                const email = req.params.email;
                // console.log(email);

                const result = await tourCollection.find({
                    $or: [
                        { organizerBy: email },
                        { friends: { $elemMatch: { email: email } } }
                    ]
                }).toArray();

                return res.send(result);
            } catch (error) {
                return res.status(400).json({ message: "Something wrong!" });
            }
        });

        app.patch("/api/v1/update-tour/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) }
                const data = req.body
                const updatedDoc = {
                    $set: {
                        organizerId: data?.organizerId,
                        organizerBy: data?.organizerBy,
                        tourName: data?.tourName,
                        description: data?.description,
                        itinerary: data?.itinerary,
                        duration: data?.duration,
                        meetingPoint: data?.meetingPoint,
                        transportation: data?.transportation,
                        cost: parseInt(data?.cost),
                        startDate: data?.startDate,
                        endDate: data?.endDate,
                        destination: data?.destination
                    }
                }
                const result = await tourCollection.updateOne(filter, updatedDoc);
                return res.send(result)
            } catch (error) {
                return res.status(400).json({ message: "Something wrong!" });
            }
        })

        app.delete("/api/v1/delete-tour/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) }
                const result = await tourCollection.deleteOne(filter);
                return res.send(result)
            } catch (error) {
                return res.status(400).json({ message: "Something wrong!" });
            }
        })

        // Search user

        // app.get("/api/v1/search-user", async (req, res) => {
        //     try {
        //         const name = req.query.name; // Accessing the 'name' query parameter
        //         const filter = { userName: new RegExp(name, 'i') };
        //         const result = await userCollection.find(filter).toArray();
        //         return res.send(result);
        //     } catch (error) {
        //         return res.status(400).json({ message: "Something wrong!" });
        //     }
        // });

        app.get("/api/v1/search-user", async (req, res) => {
            try {
                let result = [];
                const name = req.query.name; // Accessing the 'name' query parameter
                if (name) {
                    const filter = { userName: new RegExp(name, 'i') };
                    result = await userCollection.find(filter).toArray();
                }
                return res.send(result);
            } catch (error) {
                return res.status(400).json({ message: "Something wrong!" });
            }
        });

        // Add Friend in tour
        app.patch('/api/v1/tours/:id/addFriend', async (req, res) => {
            const tourId = req.params.id;
            const friendDetails = req.body;

            try {
                const filter = { _id: new ObjectId(tourId) }
                const tour = await tourCollection.findOne(filter);

                if (!tour) {
                    return res.status(404).json({ message: 'Tour not found' });
                }
                const updatedTour = {
                    ...tour,
                    friends: [...(tour.friends || []), friendDetails]
                };
                const result = await tourCollection.updateOne(filter, { $set: updatedTour });

                return res.send(result);
            } catch (error) {
                console.error('Error occurred while adding friend:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        app.delete('/api/v1/tour/:id/removeFriend/:email', async (req, res) => {
            const tourId = req.params.id;
            const friendEmail = req.params.email;

            try {
                // Find the tour by ID
                const tour = await tourCollection.findOne({ _id: new ObjectId(tourId) });

                if (!tour) {
                    return res.status(404).json({ error: 'Tour not found' });
                }

                // Find the index of the friend in the friends array
                const friendIndex = tour.friends.findIndex(friend => friend.email === friendEmail);

                if (friendIndex === -1) {
                    return res.status(404).json({ error: 'Friend not found in the tour' });
                }

                // Remove the friend from the friends array
                tour.friends.splice(friendIndex, 1);

                // Update the tour document in the database
                const result = await tourCollection.updateOne({ _id: new ObjectId(tourId) }, { $set: { friends: tour.friends } });

                return res.send(result);
            } catch (error) {
                console.error('Error removing friend:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
        });


        // Add cost expenses and update balance
        app.patch('/api/v1/tours/:id/addExpense', async (req, res) => {
            const tourId = req.params.id;
            const { payer, amount, details, email } = req.body;
            const filter = { _id: new ObjectId(tourId) }

            try {
                const tour = await tourCollection.findOne(filter);

                if (!tour) {
                    return res.status(404).json({ message: 'Tour not found' });
                }

                // Check if the "expenses" property exists, if not, create it
                if (!tour.expenses) {
                    tour.expenses = [];
                }

                // Add the new expense detail to the "expenses" array
                tour.expenses.push({ payer, amount, details, email });

                // Calculate new balances for friends
                const totalFriends = tour.friends.length;
                const perPersonAmount = amount / totalFriends;

                // Update balances
                tour.friends.forEach(friend => {
                    if (friend.email === email) {
                        friend.balance += (amount - perPersonAmount);
                    } else {
                        friend.balance -= perPersonAmount;
                    }
                });

                // Update the tour document in the database
                const result = await tourCollection.updateOne(filter, { $set: tour });

                return res.send(result);
            } catch (error) {
                console.error('Error occurred while adding expense:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Start the server
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });

    } finally {
    }
}

run().catch(console.dir);

// Test route
app.get('/', (req, res) => {
    const serverStatus = {
        message: 'Server is running smoothly',
        timestamp: new Date()
    };
    res.json(serverStatus);
});