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

// Rota de Health Check
app.get('/api/ping', (req, res) => res.json({ status: 'online', timestamp: new Date() }));

// Listar demandas e visitas com dados da unidade
app.get('/api/demandas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('demandas')
      .select('*, unidades_saude(nome_fantasia)')
      .order('prazo_fatal', { ascending: true });

    if (error) {
      console.error('Erro Supabase GET /demandas:', error);
      return res.status(500).json({ error: error.message });
    }

    const formatado = (data || []).map(d => ({
      ...d,
      unidade_nome: d.unidades_saude?.nome_fantasia || 'Unidade Geral'
    }));

    res.json(formatado);
  } catch (err) {
    console.error('Erro interno GET /demandas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listar unidades
app.get('/api/unidades', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('unidades_saude')
      .select('id, nome_fantasia, tipo_unidade')
      .order('nome_fantasia', { ascending: true });

    if (error) {
      console.error('Erro Supabase GET /unidades:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Erro interno GET /unidades:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar unidade
app.post('/api/unidades', async (req, res) => {
  const { nome_fantasia, tipo_unidade } = req.body;
  try {
    if (!nome_fantasia || typeof nome_fantasia !== 'string' || nome_fantasia.trim() === '') {
      return res.status(400).json({ error: 'O nome fantasia da unidade é obrigatório.' });
    }

    const payload = {
      nome_fantasia: nome_fantasia.trim(),
      tipo_unidade: tipo_unidade || 'Atenção Básica (ESF/UBS)',
      cnes: 'AUTO-' + Date.now().toString().slice(-8),
      tipo_gestao: 'Administração Direta',
      endereco: 'Não informado'
    };

    const { data, error } = await supabase
      .from('unidades_saude')
      .insert([payload])
      .select();

    if (error) {
      console.error('Erro Supabase POST /unidades:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro interno POST /unidades:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excluir unidade
app.delete('/api/unidades/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { count: vinculadas } = await supabase
      .from('demandas')
      .select('*', { count: 'exact', head: true })
      .eq('unidade_id', id);

    if (vinculadas && vinculadas > 0) {
      return res.status(400).json({
        error: `Não é possível excluir: existem ${vinculadas} registro(s) vinculado(s) a esta unidade.`
      });
    }

    const { data, error } = await supabase
      .from('unidades_saude')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ message: 'Unidade excluída com sucesso', deletado: data });
  } catch (err) {
    console.error('Erro ao excluir unidade:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar demanda ou visita in loco
app.post('/api/demandas', async (req, res) => {
  const { 
    protocolo, 
    origem, 
    unidade_id, 
    tipo_fiscalizacao, 
    grau_risco, 
    prazo_fatal, 
    descricao, 
    responsavel_atribuido, 
    numero_sei,
    esfera_gestao,
    status
  } = req.body;

  try {
    const payload = {
      protocolo: protocolo || 'SEM PROTOCOLO',
      origem: origem || 'Rotina da Subsecretaria',
      tipo_fiscalizacao: tipo_fiscalizacao || 'Assistencial',
      grau_risco: grau_risco || 'Médio',
      prazo_fatal: prazo_fatal || null,
      descricao: descricao || '',
      responsavel_atribuido: responsavel_atribuido || 'Comissão de Auditoria',
      status: status || 'Triagem'
    };

    if (esfera_gestao) payload.esfera_gestao = esfera_gestao;

    if (unidade_id && typeof unidade_id === 'string' && unidade_id.trim() !== '') {
      payload.unidade_id = unidade_id.trim();
    } else {
      payload.unidade_id = null;
    }

    if (numero_sei && typeof numero_sei === 'string' && numero_sei.trim() !== '') {
      payload.numero_sei = numero_sei.trim();
    }

    let { data, error } = await supabase
      .from('demandas')
      .insert([payload])
      .select('*, unidades_saude(nome_fantasia)');

    if (error && error.message.includes('esfera_gestao')) {
      delete payload.esfera_gestao;
      payload.descricao = `[GESTÃO: ${esfera_gestao || 'Administração Municipal (Direta)'}]\n` + payload.descricao;
      const fallback = await supabase
        .from('demandas')
        .insert([payload])
        .select('*, unidades_saude(nome_fantasia)');
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Erro detalhado POST /demandas:', error);
      return res.status(500).json({ error: error.message });
    }

    const item = data[0];
    res.status(201).json({
      ...item,
      unidade_nome: item.unidades_saude?.nome_fantasia || 'Unidade Geral'
    });
  } catch (err) {
    console.error('Erro interno POST /demandas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar Demanda Completa (PUT)
app.put('/api/demandas/:id', async (req, res) => {
  const { 
    protocolo, 
    origem, 
    unidade_id, 
    tipo_fiscalizacao, 
    grau_risco, 
    prazo_fatal, 
    descricao, 
    responsavel_atribuido, 
    esfera_gestao,
    status
  } = req.body;

  try {
    const payload = {
      protocolo,
      origem,
      tipo_fiscalizacao,
      grau_risco,
      prazo_fatal: prazo_fatal || null,
      descricao: descricao || '',
      responsavel_atribuido: responsavel_atribuido || 'Comissão de Auditoria',
      unidade_id: (unidade_id && unidade_id.trim() !== '') ? unidade_id.trim() : null
    };

    if (status) payload.status = status;
    if (esfera_gestao) payload.esfera_gestao = esfera_gestao;

    let { data, error } = await supabase
      .from('demandas')
      .update(payload)
      .eq('id', id)
      .select('*, unidades_saude(nome_fantasia)');

    if (error && error.message.includes('esfera_gestao')) {
      delete payload.esfera_gestao;
      const fallback = await supabase
        .from('demandas')
        .update(payload)
        .eq('id', id)
        .select('*, unidades_saude(nome_fantasia)');
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Erro PUT /demandas:', error);
      return res.status(500).json({ error: error.message });
    }

    const item = data[0];
    res.json({
      ...item,
      unidade_nome: item.unidades_saude?.nome_fantasia || 'Unidade Geral'
    });
  } catch (err) {
    console.error('Erro interno PUT /demandas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar status da demanda
app.patch('/api/demandas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updatePayload = { status };
    if (status === 'Concluída') {
      updatePayload.data_conclusao = new Date().toISOString();
    }

    let { data, error } = await supabase
      .from('demandas')
      .update(updatePayload)
      .eq('id', id)
      .select();

    if (error && error.message.includes('data_conclusao')) {
      delete updatePayload.data_conclusao;
      const fallback = await supabase
        .from('demandas')
        .update(updatePayload)
        .eq('id', id)
        .select();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Adicionar despacho
app.post('/api/demandas/:id/despachos', async (req, res) => {
  const { id } = req.params;
  const { texto, autor } = req.body;
  try {
    if (!texto || texto.trim() === '') {
      return res.status(400).json({ error: 'O texto do despacho é obrigatório.' });
    }

    const { data: demanda, error: errBusca } = await supabase
      .from('demandas')
      .select('descricao')
      .eq('id', id)
      .single();

    if (errBusca) throw errBusca;

    const dataAtual = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const novoDespacho = `\n\n--- [DESPACHO ${dataAtual} às ${horaAtual} - ${autor || 'Fiscalização'}]:\n${texto.trim()}`;
    const novaDescricao = (demanda.descricao || '') + novoDespacho;

    const { data, error } = await supabase
      .from('demandas')
      .update({ descricao: novaDescricao })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error('Erro ao inserir despacho:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excluir demanda / visita
app.delete('/api/demandas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('demandas')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ message: 'Demanda excluída com sucesso', deletado: data });
  } catch (err) {
    console.error('Erro ao excluir:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SIS-FISA API pronta na porta ${PORT}`));
