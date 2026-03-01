// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÕES
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ROTA PRINCIPAL - REDIRECIONA PARA LOGIN
// ============================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SNS - Login</title>
    <style>
        body {
            background: linear-gradient(135deg, #006633, #003300);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Arial;
            margin: 0;
        }
        .login-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            width: 350px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        h1 {
            color: #006633;
            text-align: center;
            margin-bottom: 30px;
        }
        input {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        button {
            width: 100%;
            padding: 12px;
            background: #006633;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 10px;
            font-size: 16px;
        }
        button:hover {
            background: #004d26;
        }
        .error {
            color: red;
            text-align: center;
            margin-top: 10px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>SNS - Angola</h1>
        <div id="error" class="error"></div>
        <input type="email" id="email" placeholder="Email" value="admin@sns.gov.ao">
        <input type="password" id="password" placeholder="Senha" value="Admin@2025">
        <button onclick="login()">Entrar</button>
    </div>

    <script>
        async function login() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, password})
            });
            
            const data = await res.json();
            
            if (data.token) {
                localStorage.setItem('token', data.token);
                window.location.href = '/dashboard';
            } else {
                document.getElementById('error').style.display = 'block';
                document.getElementById('error').innerText = data.erro || 'Erro no login';
            }
        }
    </script>
</body>
</html>
    `);
});

// ============================================
// ROTA DO DASHBOARD
// ============================================
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - SNS</title>
    <style>
        body {
            font-family: Arial;
            margin: 0;
            display: flex;
        }
        .sidebar {
            width: 250px;
            background: #006633;
            color: white;
            height: 100vh;
            padding: 20px;
        }
        .main {
            flex: 1;
            padding: 30px;
        }
        button {
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS</h2>
        <p>Dashboard</p>
        <p>Laboratórios</p>
        <p>Certificados</p>
    </div>
    <div class="main">
        <h1>Dashboard</h1>
        <button onclick="logout()">Sair</button>
    </div>

    <script>
        if (!localStorage.getItem('token')) {
            window.location.href = '/';
        }
        
        function logout() {
            localStorage.removeItem('token');
            window.location.href = '/';
        }
    </script>
</body>
</html>
    `);
});

// ============================================
// API DE LOGIN
// ============================================
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Login de teste
    if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
        const token = jwt.sign(
            { email, role: 'admin' },
            'secret-key-temporaria',
            { expiresIn: '8h' }
        );
        
        res.json({ token });
    } else {
        res.status(401).json({ erro: 'Email ou senha incorretos' });
    }
});

// ============================================
// CONEXÃO MONGODB (opcional)
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.log('❌ MongoDB erro:', err));

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - Servidor iniciado');
    console.log('='.repeat(50));
    console.log(`📱 URL: http://localhost:${PORT}`);
    console.log(`👤 Login: admin@sns.gov.ao / Admin@2025`);
    console.log('='.repeat(50) + '\n');
});