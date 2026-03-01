// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE (VERSÃO ESTÁVEL)
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

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.log('❌ MongoDB erro:', err));

// ============================================
// MODELO DE USUÁRIO (simples)
// ============================================
const userSchema = new mongoose.Schema({
    nome: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'admin' }
});

const User = mongoose.model('User', userSchema);

// ============================================
// ROTA PRINCIPAL - LOGIN
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
        h1 { color: #006633; text-align: center; margin-bottom: 30px; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
        button { width: 100%; padding: 12px; background: #006633; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #004d26; }
        .error { color: red; text-align: center; margin-top: 10px; display: none; }
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
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    email: document.getElementById('email').value,
                    password: document.getElementById('password').value
                })
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
        body { font-family: Arial; margin: 0; display: flex; }
        .sidebar { width: 250px; background: #006633; color: white; height: 100vh; padding: 20px; }
        .main { flex: 1; padding: 30px; }
        button { background: #dc3545; color: white; border: none; padding: 10px 20px; cursor: pointer; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px; }
        .stat-card { background: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center; }
        .stat-card h3 { color: #666; margin-bottom: 10px; }
        .stat-card .value { font-size: 24px; font-weight: bold; color: #006633; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS</h2>
        <p>📊 Dashboard</p>
        <p>🏥 Laboratórios</p>
        <p>📋 Certificados</p>
        <button onclick="logout()" style="margin-top: 20px; background: #dc3545;">Sair</button>
    </div>
    <div class="main">
        <h1>Dashboard</h1>
        <div class="stats">
            <div class="stat-card">
                <h3>Laboratórios</h3>
                <div class="value" id="totalLabs">0</div>
            </div>
            <div class="stat-card">
                <h3>Certificados</h3>
                <div class="value" id="totalCerts">0</div>
            </div>
            <div class="stat-card">
                <h3>Hoje</h3>
                <div class="value" id="certsHoje">0</div>
            </div>
        </div>
    </div>
    <script>
        if (!localStorage.getItem('token')) window.location.href = '/';
        
        async function carregarStats() {
            const res = await fetch('/api/stats', {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
            });
            const data = await res.json();
            document.getElementById('totalLabs').innerText = data.totalLabs || 0;
            document.getElementById('totalCerts').innerText = data.totalCertificados || 0;
            document.getElementById('certsHoje').innerText = data.certificadosHoje || 0;
        }
        carregarStats();
        
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
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Verificar se é o admin padrão
    if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
        // Verificar se já existe no banco
        let user = await User.findOne({ email });
        
        if (!user) {
            // Criar se não existir
            const senhaHash = await bcrypt.hash(password, 10);
            user = await User.create({
                nome: 'Administrador',
                email,
                password: senhaHash,
                role: 'admin'
            });
        }
        
        const token = jwt.sign(
            { id: user._id, email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '8h' }
        );
        
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else {
        res.status(401).json({ erro: 'Email ou senha incorretos' });
    }
});

// ============================================
// API DE ESTATÍSTICAS
// ============================================
app.get('/api/stats', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Não autorizado' });
    
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        res.json({
            totalLabs: 0,
            totalCertificados: 0,
            certificadosHoje: 0
        });
    } catch (err) {
        res.status(401).json({ erro: 'Token inválido' });
    }
});

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