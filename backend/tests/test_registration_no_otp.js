/**
 * FLARE WOMEN SAFETY - DIRECT REGISTRATION (NO OTP) VERIFICATION SUITE
 * 
 * Verifies:
 * 1. POST /api/auth/register creates user directly without OTP verification
 * 2. Password is secure, salt-hashed with bcrypt (never stored in plain text)
 * 3. Duplicate email rejection
 * 4. Duplicate mobile phone rejection
 * 5. Invalid email format rejection
 * 6. Missing full name rejection
 * 7. Invalid mobile number (short digits) rejection
 * 8. Weak password (< 6 chars) rejection
 * 9. Frontend index.html completely removed OTP elements and kept all registration fields
 * 10. Frontend app.js removed all OTP handlers and state variables
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { router } = require('../routes/auth');

console.log('================================================================');
console.log('🧪 FLARE SOS - REGISTRATION WITHOUT OTP VERIFICATION SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ [PASS] TEST ${totalTests}: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ [FAIL] TEST ${totalTests}: ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`✅ [PASS] TEST ${totalTests}: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ [FAIL] TEST ${totalTests}: ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

// Helper to find the register route handler from router stack
function getRegisterHandler() {
    const layer = router.stack.find(l => l.route && l.route.path === '/register' && l.route.methods.post);
    if (!layer) throw new Error('POST /register route not found in router');
    return layer.route.stack[0].handle;
}

// Helper to create mock req and res
function createMockHttp(body) {
    let statusCode = 200;
    let responseData = null;
    let finished = false;

    const req = {
        body,
        headers: {}
    };

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseData = data;
            finished = true;
            return this;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData,
        isFinished: () => finished
    };

    return { req, res };
}

async function runSuite() {
    const registerHandler = getRegisterHandler();

    // -------------------------------------------------------------------------
    // TEST 1: Direct registration succeeds without OTP
    // -------------------------------------------------------------------------
    await runAsyncTest('Direct registration creates user and returns JWT without OTP requirement', async () => {
        const origFindOne = User.findOne;
        const origSave = User.prototype.save;

        let savedUser = null;
        User.findOne = async () => null; // No existing user
        User.prototype.save = async function() {
            savedUser = this;
            this.id = 'mock_user_id_12345';
            this._id = 'mock_user_id_12345';
            return this;
        };

        try {
            const { req, res } = createMockHttp({
                name: 'Direct User',
                email: 'direct_user@example.com',
                password: 'ValidPassword123',
                phone: '9876543210',
                countryCode: '+91'
                // Notice: NO OTP submitted!
            });

            await registerHandler(req, res);

            assert.strictEqual(res.getStatusCode(), 201, 'Response status should be 201 Created');
            const data = res.getData();
            assert.ok(data.token, 'Response must include JWT token');
            assert.ok(data.user, 'Response must include user object');
            assert.strictEqual(data.user.email, 'direct_user@example.com');
            assert.strictEqual(data.user.name, 'Direct User');
            assert.strictEqual(data.user.phone, '+919876543210');
            assert.ok(savedUser, 'User must have been saved');
            assert.strictEqual(savedUser.mobileVerified, true);
        } finally {
            User.findOne = origFindOne;
            User.prototype.save = origSave;
        }
    });

    // -------------------------------------------------------------------------
    // TEST 2: Password securely hashed using bcrypt (never plaintext)
    // -------------------------------------------------------------------------
    await runAsyncTest('Password is securely hashed with bcrypt in User record', async () => {
        const origFindOne = User.findOne;
        const origSave = User.prototype.save;

        let savedPassword = null;
        User.findOne = async () => null;
        User.prototype.save = async function() {
            savedPassword = this.password;
            return this;
        };

        try {
            const rawPassword = 'SecretPassword987';
            const { req, res } = createMockHttp({
                name: 'Security User',
                email: 'security@example.com',
                password: rawPassword,
                phone: '9876543210'
            });

            await registerHandler(req, res);

            assert.notStrictEqual(savedPassword, rawPassword, 'Password must not be stored in plain text');
            assert.ok(savedPassword.startsWith('$2'), 'Password must be bcrypt hash starting with $2');
            const match = await bcrypt.compare(rawPassword, savedPassword);
            assert.strictEqual(match, true, 'Bcrypt compare must verify password successfully');
        } finally {
            User.findOne = origFindOne;
            User.prototype.save = origSave;
        }
    });

    // -------------------------------------------------------------------------
    // TEST 3: Duplicate email rejection
    // -------------------------------------------------------------------------
    await runAsyncTest('Duplicate email address is rejected with 400', async () => {
        const origFindOne = User.findOne;
        User.findOne = async (query) => {
            if (query.email) return { email: query.email };
            return null;
        };

        try {
            const { req, res } = createMockHttp({
                name: 'Duplicate Email User',
                email: 'existing@example.com',
                password: 'Password123',
                phone: '9876543210'
            });

            await registerHandler(req, res);

            assert.strictEqual(res.getStatusCode(), 400);
            assert.ok(res.getData().msg.toLowerCase().includes('already exists'), 'Error message must specify account exists');
        } finally {
            User.findOne = origFindOne;
        }
    });

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate mobile number rejection
    // -------------------------------------------------------------------------
    await runAsyncTest('Duplicate mobile number is rejected with 400', async () => {
        const origFindOne = User.findOne;
        User.findOne = async (query) => {
            if (query.email) return null; // Email is free
            if (query.$or) return { phone: '+919876543210' }; // Phone already used
            return null;
        };

        try {
            const { req, res } = createMockHttp({
                name: 'Duplicate Phone User',
                email: 'newemail@example.com',
                password: 'Password123',
                phone: '9876543210'
            });

            await registerHandler(req, res);

            assert.strictEqual(res.getStatusCode(), 400);
            assert.ok(res.getData().msg.toLowerCase().includes('mobile phone number already exists'), 'Error message must specify mobile number exists');
        } finally {
            User.findOne = origFindOne;
        }
    });

    // -------------------------------------------------------------------------
    // TEST 5: Invalid email format rejection
    // -------------------------------------------------------------------------
    await runAsyncTest('Invalid email format rejected with 400', async () => {
        const { req, res } = createMockHttp({
            name: 'Bad Email User',
            email: 'not-a-valid-email',
            password: 'Password123',
            phone: '9876543210'
        });

        await registerHandler(req, res);

        assert.strictEqual(res.getStatusCode(), 400);
        assert.ok(res.getData().msg.toLowerCase().includes('valid email'));
    });

    // -------------------------------------------------------------------------
    // TEST 6: Missing full name rejection
    // -------------------------------------------------------------------------
    await runAsyncTest('Missing full name rejected with 400', async () => {
        const { req, res } = createMockHttp({
            name: '    ',
            email: 'valid@example.com',
            password: 'Password123',
            phone: '9876543210'
        });

        await registerHandler(req, res);

        assert.strictEqual(res.getStatusCode(), 400);
        assert.ok(res.getData().msg.toLowerCase().includes('full name'));
    });

    // -------------------------------------------------------------------------
    // TEST 7: Invalid phone number rejection (less than 7 digits)
    // -------------------------------------------------------------------------
    await runAsyncTest('Invalid phone number with too few digits rejected with 400', async () => {
        const { req, res } = createMockHttp({
            name: 'Short Phone User',
            email: 'valid@example.com',
            password: 'Password123',
            phone: '123'
        });

        await registerHandler(req, res);

        assert.strictEqual(res.getStatusCode(), 400);
        assert.ok(res.getData().msg.toLowerCase().includes('valid mobile number'));
    });

    // -------------------------------------------------------------------------
    // TEST 8: Weak password (< 6 characters) rejection
    // -------------------------------------------------------------------------
    await runAsyncTest('Password with fewer than 6 characters rejected with 400', async () => {
        const { req, res } = createMockHttp({
            name: 'Short Pass User',
            email: 'valid@example.com',
            password: '123',
            phone: '9876543210'
        });

        await registerHandler(req, res);

        assert.strictEqual(res.getStatusCode(), 400);
        assert.ok(res.getData().msg.toLowerCase().includes('6 characters'));
    });

    // -------------------------------------------------------------------------
    // TEST 9: Frontend HTML markup check
    // -------------------------------------------------------------------------
    runTest('frontend/index.html registration form has NO OTP elements and retains all required fields', () => {
        const html = fs.readFileSync(path.join(__dirname, '../../frontend/index.html'), 'utf8');

        // Must NOT contain OTP controls
        assert.ok(!html.includes('id="btn-send-otp"'), 'Send OTP button must be removed');
        assert.ok(!html.includes('id="reg-otp"'), 'OTP input field must be removed');
        assert.ok(!html.includes('id="btn-verify-otp"'), 'Verify OTP button must be removed');
        assert.ok(!html.includes('id="otp-group"'), 'OTP input group must be removed');
        assert.ok(!html.includes('id="otp-status-msg"'), 'OTP status msg must be removed');
        assert.ok(!html.toLowerCase().includes('verify otp'), 'No Verify OTP text in HTML');
        assert.ok(!html.toLowerCase().includes('send otp'), 'No Send OTP text in HTML');

        // Must retain core registration elements
        assert.ok(html.includes('id="reg-name"'), 'Full Name input must be retained');
        assert.ok(html.includes('id="reg-email"'), 'Email input must be retained');
        assert.ok(html.includes('id="reg-country-code"'), 'Country code select must be retained');
        assert.ok(html.includes('id="reg-phone"'), 'Mobile phone input must be retained');
        assert.ok(html.includes('id="reg-password"'), 'Password input must be retained');
        assert.ok(html.includes('id="btn-create-account"'), 'Create Account button must be retained');
    });

    // -------------------------------------------------------------------------
    // TEST 10: Frontend JavaScript logic check
    // -------------------------------------------------------------------------
    runTest('frontend/js/app.js registration logic has NO OTP handlers, state, or checks', () => {
        const js = fs.readFileSync(path.join(__dirname, '../../frontend/js/app.js'), 'utf8');

        assert.ok(!js.includes('isMobileVerified'), 'isMobileVerified variable must be removed');
        assert.ok(!js.includes('handleSendOTP'), 'handleSendOTP function must be removed');
        assert.ok(!js.includes('handleVerifyOTP'), 'handleVerifyOTP function must be removed');
        assert.ok(!js.includes('btn-send-otp'), 'No reference to btn-send-otp');
        assert.ok(!js.includes('btn-verify-otp'), 'No reference to btn-verify-otp');
        assert.ok(!js.includes('reg-otp'), 'No reference to reg-otp');

        // Must have direct registration submit handler
        assert.ok(js.includes("document.getElementById('register-form').addEventListener('submit'"), 'Register submit event must exist');
        assert.ok(js.includes('api.register('), 'Must call api.register directly');
        assert.ok(js.includes('handleAuthSuccess('), 'Must call handleAuthSuccess on successful registration');
    });

    console.log('\n================================================================');
    console.log(`📊 FINAL RESULT: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
