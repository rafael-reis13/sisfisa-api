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

// Listar demandas ativas com o nome da unidade vinculada
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

// Listar todas as unidades de saúde
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

// Cadastrar nova unidade de saúde (com CNES único gerado automaticamente para contornar UNIQUE)
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
      console.error('Erro detalhado no Supabase POST /unidades:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro interno na API POST /unidades:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excluir unidade de saúde por ID
app.delete('/api/unidades/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { count: demandasVinculadas } = await supabase
      .from('demandas')
      .select('*', { count: 'exact', head: true })
      .eq('unidade_id', id);

    if (demandasVinculadas && demandasVinculadas > 0) {
      return res.status(400).json({
        error: `Não é possível excluir esta unidade pois existem ${demandasVinculadas} demanda(s) vinculada(s) a ela.`
      });
    }

    const { data, error } = await supabase
      .from('unidades_saude')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro ao excluir unidade no Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Unidade excluída com sucesso', deletado: data });
  } catch (err) {
    console.error('Erro interno ao excluir unidade:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar nova demanda (com campo esfera_gestao / tipo de executor)
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
    esfera_gestao 
  } = req.body;

  try {
    const payload = {
      protocolo: protocolo || 'SEM PROTOCOLO',
      origem: origem || 'Rotina da Subsecretaria',
      tipo_fiscalizacao: tipo_fiscalizacao || 'Assistencial',
      grau_risco: grau_risco || 'Médio',
      prazo_fatal: prazo_fatal || null,
      descricao: descricao || '',
      responsavel_atribuido: responsavel_atribuido || 'Comissão de Auditoria'
    };

    // Caso a coluna exista no banco, inclui esfera_gestao; se não existir, grava dentro da descrição ou campo auxiliar
    if (esfera_gestao) {
      payload.esfera_gestao = esfera_gestao;
    }

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

    // Fallback: se a coluna 'esfera_gestao' ainda não tiver sido criada no Supabase, insere com tag no topo da descrição
    if (error && error.message.includes('esfera_gestao')) {
      delete payload.esfera_gestao;
      payload.descricao = `[GESTÃO: ${esfera_gestao || 'Município'}]\n` + payload.descricao;
      const tentativa = await supabase
        .from('demandas')
        .insert([payload])
        .select('*, unidades_saude(nome_fantasia)');
      data = tentativa.data;
      error = tentativa.error;
    }

    if (error) {
      console.error('Erro detalhado no Supabase POST /demandas:', error);
      return res.status(500).json({ error: error.message });
    }

    const item = data[0];
    res.status(201).json({
      ...item,
      unidade_nome: item.unidades_saude?.nome_fantasia || 'Unidade Geral'
    });
  } catch (err) {
    console.error('Erro interno na API POST /demandas:', err);
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

// Excluir demanda por ID
app.delete('/api/demandas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('demandas')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro ao excluir no Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Demanda excluída com sucesso', deletado: data });
  } catch (err) {
    console.error('Erro interno ao excluir:', err);
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
