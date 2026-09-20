# EnergyNex -- Smart Energy Meter

EnergyNex is an IoT-based smart energy monitoring and control system
designed to monitor electrical parameters in real time, detect abnormal
conditions, provide remote relay control, and display energy usage and
billing information through a web dashboard.

## Features

-   Real-time voltage, current, power, energy, power factor, and
    temperature monitoring
-   MQTT-based communication between ESP32 and the backend
-   Overload detection
-   Wire tampering detection
-   Electricity theft detection
-   Remote relay ON/OFF control
-   Configurable maximum load limit
-   Bill reset functionality
-   Real-time dashboard with charts
-   Electricity bill calculation
-   Firebase Firestore data storage
-   Firebase Cloud Messaging (FCM) notifications
-   Responsive web dashboard for desktop and mobile
-   Cloud deployment using AWS EC2
-   Backend process management using PM2
-   Frontend hosting using Nginx
-   REST API for frontend-to-backend communication

## System Architecture

``` text
ESP32
  │
  │ MQTT
  ▼
Mosquitto MQTT Broker
  │
  ▼
Node.js + Express Backend
  │
  ├── Firebase Firestore
  ├── Firebase Cloud Messaging
  └── REST API
          │
          ▼
HTML + CSS + JavaScript + Chart.js
          │
          ▼
     Web Dashboard
```

## Technologies Used

### Hardware

-   ESP32
-   ZMPT101B Voltage Sensor
-   ACS712 Current Sensors
-   ADS1115 ADC
-   DHT11 Temperature Sensor
-   Relay Module

### Software & Cloud

-   JavaScript
-   HTML
-   CSS
-   Node.js
-   Express.js
-   REST API
-   MQTT
-   Mosquitto
-   Firebase Firestore
-   Firebase Cloud Messaging (FCM)
-   Chart.js
-   AWS EC2
-   Ubuntu Linux
-   Nginx
-   PM2
-   Git & GitHub

## MQTT Topics

The system uses the following MQTT topics:

### Energy Data

``` text
home/energy/data
```

Example:

``` json
{
  "voltage": 230,
  "current": 2.5,
  "energy": 1.25,
  "power": 575,
  "pf": 0.98,
  "temp": 32
}
```

### Status

``` text
home/energy/status
```

Example:

``` json
{
  "overload": false,
  "wire_tempered": false,
  "theft": false,
  "relay": true
}
```

### Control

``` text
home/energy/control
```

Example:

``` json
{
  "relay": true,
  "max_load": 2000,
  "bill_reset": false
}
```

## Project Structure

``` text
EnergyNex/
│
├── .gitignore
│
├── energy-backend/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
└── energy-frontend/
    ├── .vscode/
    │   └── settings.json
    ├── app.js
    ├── index.html
    └── style.css
```

> `firebase-key.json`, `.env`, `node_modules`, and runtime log files are
> intentionally excluded from the repository for security and project
> cleanliness.

## Backend Setup

Go to the backend directory:

``` bash
cd energy-backend
```

Install dependencies:

``` bash
npm install
```

The backend requires a Firebase service-account key. Place the private
key file in the backend directory as:

``` text
firebase-key.json
```

Do not upload this file to GitHub.

Start the server:

``` bash
node server.js
```

For production process management with PM2:

``` bash
pm2 start server.js --name energy-backend
pm2 save
```

## Frontend Setup

The frontend consists of:

``` text
index.html
style.css
app.js
```

It can be served using a web server such as Nginx.

For an AWS deployment, the frontend files can be placed in the Nginx web
root:

``` bash
/var/www/html
```

## AWS Deployment

The project can be deployed using AWS EC2.

### Backend

-   Ubuntu EC2 instance
-   Node.js
-   Mosquitto MQTT broker
-   PM2
-   Firebase Admin SDK

### Frontend

-   Separate Ubuntu EC2 instance
-   Nginx
-   HTML/CSS/JavaScript frontend

The frontend communicates with the Node.js backend through REST APIs.

## Data Flow

``` text
Sensors
   ↓
ESP32
   ↓
MQTT
   ↓
Mosquitto Broker
   ↓
Node.js Backend
   ├──→ Firestore
   ├──→ FCM Notifications
   └──→ REST API
            ↓
       Web Dashboard
```

For relay control:

``` text
Web Dashboard
      ↓
REST API
      ↓
Node.js Backend
      ↓
MQTT
      ↓
ESP32
      ↓
Relay
```

## Security

Sensitive credentials are not included in this repository.

The `.gitignore` file excludes:

``` text
energy-backend/firebase-key.json
energy-backend/node_modules/
.env
energy-backend/.env
energy-backend/nohup.out
npm-debug.log*
```

Never commit Firebase service-account credentials, API secrets,
passwords, or private tokens to GitHub.

## Future Improvements

-   User authentication and role-based access
-   More detailed electricity tariff/slab billing
-   Historical energy analytics
-   Improved mobile application integration
-   Automated reports and notifications
-   Additional energy-saving recommendations

## Author

**AKASH KUMAR BAG**

Electronics & Communication Engineering Student

GitHub: [AKASHBAG01](https://github.com/AKASHBAG01)

## License

This project is intended for educational and academic project purposes.
