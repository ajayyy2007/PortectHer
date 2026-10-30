
const path = require('path');
const dns = require('dns');

// Configure DNS for MongoDB Atlas SRV lookups
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const sosRoutes = require('./routes/sos');
const alertsRoutes = require('./routes/alerts');
const whatsappWebhookRoutes = require('./routes/whatsappWebhook');

const { verifyEmailConfig } = require('./services/emailService');
const { verifySMSConfig } = require('./services/smsService');
const { verifyWhatsAppConfig } = require('./services/whatsappService');

const app = express();

// Security Headers Middleware
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false
    })
);

// CORS Configuration
app.use(cors());

// Rate Limiting Middleware for Auth Routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        msg: 'Too many requests from this IP, please try again after 15 minutes.'
    }
});

app.use('/api/auth/send-otp', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);

// Body Parsing Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve Frontend Static Files & Uploads
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Register API Routes
app.use('/api/auth', authRoutes.router);
app.use('/api/contacts', contactsRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/danger-zones', require('./routes/dangerZones'));
app.use('/api/whatsapp/webhook', whatsappWebhookRoutes);

// Diagnostic Health Check Route
app.get('/api/diagnostics', async (req, res) => {
    try {
        const [emailDiag, smsDiag, waDiag] = await Promise.all([
            verifyEmailConfig(),
            verifySMSConfig(),
            verifyWhatsAppConfig()
        ]);

        res.json({
            status: 'Online',
            database:
                mongoose.connection.readyState === 1
                    ? 'Connected'
                    : 'Disconnected',
            services: {
                email: emailDiag,
                sms: smsDiag,
                whatsapp: waDiag
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Root API Health Check Route
app.get('/api/status', (req, res) => {
    res.json({
        name: 'FLARE Women Safety Emergency API',
        status: 'Online',
        whatsappMode: process.env.WHATSAPP_MODE || 'development',
        version: '2.0.0'
    });
});

// Database Connection and Server Startup
if (require.main === module) {
    const mongoURI =
        process.env.MONGODB_URI ||
        'mongodb://localhost:27017/womensafety';

    mongoose
        .connect(mongoURI, {
            serverSelectionTimeoutMS: 15000
        })
        .then(async () => {
            console.log('✅ MongoDB connected successfully');
            console.log('Database name:', mongoose.connection.name);
            console.log('Users collection:', mongoose.connection.collection('users').collectionName);
            try {
                const [emailDiag, smsDiag, waDiag] = await Promise.all([
                    verifyEmailConfig(),
                    verifySMSConfig(),
                    verifyWhatsAppConfig()
                ]);

                console.log(
                    '\n================== FLARE SERVICE DIAGNOSTICS =================='
                );

                console.log(
                    `📧 Email Service : [ ${
                        emailDiag.configured
                            ? emailDiag.verified
                                ? 'Verified (Gmail SMTP)'
                                : 'Configured (Auth Check Failed)'
                            : 'Not Configured'
                    } ]`
                );

                console.log(
                    `📱 SMS Service   : [ ${
                        smsDiag.configured
                            ? smsDiag.providers.join(', ')
                            : 'Not Configured'
                    } ]`
                );

                console.log(
                    `📲 WhatsApp Mode : [ ${
                        waDiag.mode.toUpperCase()
                    }${
                        waDiag.configured
                            ? ' - ' + (waDiag.provider || 'Simulated')
                            : ' - Missing Credentials'
                    } ]`
                );

                console.log(
                    '===============================================================\n'
                );
            } catch (diagErr) {
                console.warn('Diagnostics notice:', diagErr.message);
            }
        })
        .catch(err => {
            console.error(
                '❌ MongoDB connection error:',
                err.message
            );
        });

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
        console.log('\n===============================================================');
        console.log(`🚀 FLARE Women Safety Server running on port ${PORT}`);
        console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
        console.log('===============================================================\n');
    });
}

module.exports = app;
