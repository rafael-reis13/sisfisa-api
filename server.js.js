// server.js
// Dependências: npm install express pg cors dotenv
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão via parâmetros individuais (imune a erros de caracteres especiais na senha)
const pool = new Pool({
  host: process.env.DB_HOST || 'aws-0-sa-east-1.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT, 10) || 6543,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres.tzqjokydncchqhybljdb',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// Listar demandas ativas com dados da unidade
app.get('/api/demandas', async (req, res) => {
  try {
    const query = `
      SELECT d.*, u.nome_fantasia as unidade_nome, u.cnes 
      FROM demandas d
      LEFT JOIN unidades_saude u ON d.unidade_id = u.id
      ORDER BY 
        CASE d.grau_risco 
          WHEN 'Crítico' THEN 1 
          WHEN 'Alto' THEN 2 
          WHEN 'Médio' THEN 3 
          ELSE 4 
        END, d.prazo_fatal ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar nova demanda
app.post('/api/demandas', async (req, res) => {
  const { protocolo, origem, unidade_id, tipo_fiscalizacao, grau_risco, prazo_fatal, descricao, responsavel_atribuido, numero_sei } = req.body;
  try {
    const query = `
      INSERT INTO demandas (protocolo, origem, unidade_id, tipo_fiscalizacao, grau_risco, prazo_fatal, descricao, responsavel_atribuido, numero_sei)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;
    `;
    const { rows } = await pool.query(query, [protocolo, origem, unidade_id, tipo_fiscalizacao, grau_risco, prazo_fatal, descricao, responsavel_atribuido, numero_sei]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar status da demanda
app.patch('/api/demandas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { rows } = await pool.query('UPDATE demandas SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Métricas de Painel (Dashboard)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const countTotal = await pool.query('SELECT COUNT(*) FROM demandas');
    const countCritico = await pool.query("SELECT COUNT(*) FROM demandas WHERE grau_risco = 'Crítico'");
    const countConcluidas = await pool.query("SELECT COUNT(*) FROM demandas WHERE status = 'Concluída'");
    
    res.json({
      total: countTotal.rows[0].count,
      criticas: countCritico.rows[0].count,
      concluidas: countConcluidas.rows[0].count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SIS-FISA API operando na porta ${PORT}`));
