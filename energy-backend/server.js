const admin = require("firebase-admin");
const mqtt = require("mqtt");
const express = require("express");
const cors = require("cors");

const serviceAccount = require("./firebase-key.json");

// ==========================================
// FIREBASE START
// ==========================================

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ==========================================
// FIRESTORE DATABASE
// ==========================================

const db = admin.firestore();

const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// MQTT CONNECTION
// ==========================================

const mqttClient = mqtt.connect("mqtt://localhost:1883");

// ==========================================
// MOBILE FCM TOKEN
// ==========================================

const FCM_TOKEN =
"cjaqVyCY2QU:APA91bEmsDlpRBGD0mpe4eB5CRLNOIkfyoXT5m3pAA0h0YoTtRoH-HaZKeq2GeAlpc6itARRV1g53fYfXTFsJ8KohluGZNwsWsXcngWB4QIO1fdZKWKKcnU";

// ==========================================
// DEFAULT SETTINGS
// ==========================================

let MAX_LOAD = 2000;

// ==========================================
// MQTT CONNECTED
// ==========================================

mqttClient.on("connect", () => {

    console.log("MQTT Connected");

    mqttClient.subscribe("home/energy/data");

    mqttClient.subscribe("home/energy/status");

    console.log("Subscribed to MQTT topics");
});

// ==========================================
// MQTT MESSAGE RECEIVE
// ==========================================

mqttClient.on("message", async (topic, message) => {

    const data = message.toString();

    console.log("Topic:", topic);

    console.log("Message:", data);

    try {

        const msg = JSON.parse(data);

        // ======================================
        // SENSOR DATA
        // ======================================

        if(topic === "home/energy/data"){

            // BILL CALCULATION

            const tariff = 7.5;

            const bill = (msg.energy || 0) * tariff;

            // SAVE SENSOR DATA

            await db.collection("energyData").add({

                voltage: msg.voltage || 0,

                current: msg.current || 0,

                energy: msg.energy || 0,

                power: msg.power || 0,

                pf: msg.pf || 0,

                temp: msg.temp || 0,

                bill: bill,

                tariff: tariff,

                time: new Date()

            });

            console.log("Energy data saved");

            // ==================================
            // OVERLOAD CHECK
            // ==================================

            if(msg.power > MAX_LOAD){

                console.log("Overload detected");

                // FIREBASE NOTIFICATION

                await admin.messaging().send({

                    token: FCM_TOKEN,

                    notification: {

                        title: "⚠ Overload Alert",

                        body: "Power exceeded limit"

                    }

                });

                console.log("Overload notification sent");

                // AUTO RELAY OFF

                mqttClient.publish(

                    "home/energy/control",

                    JSON.stringify({

                        relay: false

                    })

                );

                console.log("Relay OFF command sent");
            }

            // ==================================
            // HIGH TEMPERATURE
            // ==================================

            if(msg.temp > 60){

                await admin.messaging().send({

                    token: FCM_TOKEN,

                    notification: {

                        title: "🌡 High Temperature",

                        body: "Temperature exceeded limit"

                    }

                });

                console.log("Temperature alert sent");
            }
        }

        // ======================================
        // STATUS TOPIC
        // ======================================

        if(topic === "home/energy/status"){

            // SAVE STATUS DATA

            await db.collection("statusData").add({

                overload: msg.overload || false,

                wire_tempered:
                msg.wire_tempered || false,

                theft: msg.theft || false,

                relay: msg.relay || false,

                time: new Date()

            });

            console.log("Status data saved");

            // ==================================
            // THEFT ALERT
            // ==================================

            if(msg.theft === true){

                console.log("Theft detected");

                await admin.messaging().send({

                    token: FCM_TOKEN,

                    notification: {

                        title: "⚠ Theft Alert",

                        body: "Electricity theft detected"

                    }

                });

                console.log("Theft notification sent");
            }

            // ==================================
            // WIRE TAMPER ALERT
            // ==================================

            if(msg.wire_tempered === true){

                console.log("Wire tampering detected");

                await admin.messaging().send({

                    token: FCM_TOKEN,

                    notification: {

                        title:
                        "⚠ Wire Tamper Alert",

                        body:
                        "Wire tampering detected"

                    }

                });

                console.log(
                "Wire tamper notification sent"
                );
            }

            // ==================================
            // OVERLOAD ALERT
            // ==================================

            if(msg.overload === true){

                await admin.messaging().send({

                    token: FCM_TOKEN,

                    notification: {

                        title: "⚠ Overload Alert",

                        body: "Overload detected"

                    }

                });

                console.log(
                "Overload notification sent"
                );
            }
        }

    } catch (err) {

        console.log(err);
    }
});

// ==========================================
// CONTROL API
// ==========================================

app.post("/control", (req, res) => {

    // UPDATE MAX LOAD

    if(req.body.max_load){

        MAX_LOAD = req.body.max_load;

        console.log(
        "New max load:",
        MAX_LOAD
        );
    }

    // BILL RESET

    if(req.body.bill_reset){

        console.log("Bill reset requested");
    }

    // SEND CONTROL MQTT

    mqttClient.publish(

        "home/energy/control",

        JSON.stringify({

            relay: req.body.relay,

            max_load: req.body.max_load,

            bill_reset: req.body.bill_reset

        })

    );

    console.log("Control command sent");

    res.send("Control command sent");
});

// ==========================================
// SERVER START
// ==========================================

app.listen(3000, () => {

    console.log("Server running on port 3000");
});
