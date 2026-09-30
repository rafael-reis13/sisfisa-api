// server.js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão via HTTPS nativo usando as variáveis configuradas no Render
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Listar demandas ativas de forma direta e segura
app.get('/api/demandas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('demandas')
      .select('*')
      .order('prazo_fatal', { ascending: true });

    if (error) {
      console.error('Erro Supabase GET:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Erro interno GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar nova demanda (com tratamento seguro de campos opcionais)
app.post('/api/demandas', async (req, res) => {
  const { protocolo, origem, unidade_id, tipo_fiscalizacao, grau_risco, prazo_fatal, descricao, responsavel_atribuido, numero_sei } = req.body;
  try {
    // Monta o payload garantindo que campos vazios não quebrem o schema
    const payload = {
      protocolo: protocolo || 'SEM PROTOCOLO',
      origem: origem || 'Rotina da Subsecretaria',
      tipo_fiscalizacao: tipo_fiscalizacao || 'Assistencial',
      grau_risco: grau_risco || 'Médio',
      prazo_fatal: prazo_fatal || null,
      descricao: descricao || '',
      responsavel_atribuido: responsavel_atribuido || 'Comissão de Auditoria'
    };

    // Só inclui unidade_id se for um UUID preenchido válido
    if (unidade_id && unidade_id.trim() !== '') {
      payload.unidade_id = unidade_id;
    }

    if (numero_sei && numero_sei.trim() !== '') {
      payload.numero_sei = numero_sei;
    }

    const { data, error } = await supabase
      .from('demandas')
      .insert([payload])
      .select();

    if (error) {
      console.error('Erro detalhado no Supabase POST:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro interno na API:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar status da demanda
app.patch('/api/demandas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { data, error } = await supabase
      .from('demandas')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Métricas de Painel (Dashboard)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { count: total } = await supabase.from('demandas').select('*', { count: 'exact', head: true });
    const { count: criticas } = await supabase.from('demandas').select('*', { count: 'exact', head: true }).eq('grau_risco', 'Crítico');
    const { count: concluidas } = await supabase.from('demandas').select('*', { count: 'exact', head: true }).eq('status', 'Concluída');

    res.json({ total, criticas, concluidas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SIS-FISA API pronta na porta ${PORT}`));
