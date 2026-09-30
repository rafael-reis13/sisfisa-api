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

// Listar demandas ativas
app.get('/api/demandas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('demandas')
      .select('*, unidades_saude(nome_fantasia, cnes)')
      .order('prazo_fatal', { ascending: true });

    if (error) throw error;

    const formatado = data.map(d => ({
      ...d,
      unidade_nome: d.unidades_saude?.nome_fantasia || 'Geral',
      cnes: d.unidades_saude?.cnes || ''
    }));

    res.json(formatado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar nova demanda
app.post('/api/demandas', async (req, res) => {
  const { protocolo, origem, unidade_id, tipo_fiscalizacao, grau_risco, prazo_fatal, descricao, responsavel_atribuido, numero_sei } = req.body;
  try {
    const { data, error } = await supabase
      .from('demandas')
      .insert([{
        protocolo,
        origem,
        unidade_id: unidade_id || null,
        tipo_fiscalizacao,
        grau_risco,
        prazo_fatal,
        descricao,
        responsavel_atribuido,
        numero_sei
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
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
