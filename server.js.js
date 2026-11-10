// server.js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão via HTTPS nativo usando as variáveis de ambiente configuradas no Render
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Rota de Health Check / Ping
app.get('/api/ping', (req, res) => res.json({ status: 'online', timestamp: new Date() }));

// ==========================================
// 1. ROTAS DE DEMANDAS, REUNIÕES E VISITAS
// ==========================================

// Listar demandas e visitas com dados da unidade vinculada
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

// Cadastrar demanda, reunião ou visita (blindado contra protocolos duplicados e erros de coluna)
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
    let limpaUnidadeId = null;
    if (unidade_id && typeof unidade_id === 'string' && unidade_id.trim() !== '') {
      limpaUnidadeId = unidade_id.trim();
    } else if (unidade_id && typeof unidade_id !== 'string') {
      limpaUnidadeId = unidade_id;
    }

    // Tratamento para evitar estourar o limite de 30 caracteres do banco
    let baseProtocolo = (protocolo || 'SEM PROTOCOLO').trim().slice(0, 30);

    // Evita erro de constraint UNIQUE caso já exista esse protocolo
    const { data: existente } = await supabase
      .from('demandas')
      .select('id')
      .eq('protocolo', baseProtocolo);

    if (existente && existente.length > 0) {
      const sufixo = '-' + Date.now().toString().slice(-4);
      baseProtocolo = baseProtocolo.slice(0, 30 - sufixo.length) + sufixo;
    }

    const payload = {
      protocolo: baseProtocolo,
      origem: origem || 'Rotina da Subsecretaria',
      tipo_fiscalizacao: tipo_fiscalizacao || 'Assistencial',
      grau_risco: grau_risco || 'Médio',
      prazo_fatal: prazo_fatal || null,
      descricao: descricao || '',
      responsavel_atribuido: responsavel_atribuido || 'Comissão de Auditoria',
      status: status || 'Triagem',
      unidade_id: limpaUnidadeId
    };

    if (esfera_gestao) payload.esfera_gestao = esfera_gestao;

    if (numero_sei && typeof numero_sei === 'string' && numero_sei.trim() !== '') {
      payload.numero_sei = numero_sei.trim().slice(0, 30);
    }

    let { data, error } = await supabase
      .from('demandas')
      .insert([payload])
      .select();

    // Fallback se a coluna esfera_gestao não existir na tabela
    if (error && error.message && error.message.includes('esfera_gestao')) {
      delete payload.esfera_gestao;
      payload.descricao = `[GESTÃO: ${esfera_gestao || 'Administração Municipal (Direta)'}]\n` + payload.descricao;
      const fallback = await supabase
        .from('demandas')
        .insert([payload])
        .select();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Erro detalhado POST /demandas:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro interno POST /demandas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Handler único para atualizar demanda (PUT / PATCH / POST)
const atualizarDemandaHandler = async (req, res) => {
  const { id } = req.params;
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
    let limpaUnidadeId = null;
    if (unidade_id && typeof unidade_id === 'string' && unidade_id.trim() !== '') {
      limpaUnidadeId = unidade_id.trim();
    } else if (unidade_id && typeof unidade_id !== 'string') {
      limpaUnidadeId = unidade_id;
    }

    let limpaDescricao = descricao || '';
    if (esfera_gestao && !limpaDescricao.includes('[GESTÃO:')) {
      limpaDescricao = `[GESTÃO: ${esfera_gestao}]\n` + limpaDescricao;
    }

    const payload = {
      protocolo: (protocolo || 'SEM PROTOCOLO').trim().slice(0, 30),
      origem: origem || 'Rotina da Subsecretaria',
      tipo_fiscalizacao: tipo_fiscalizacao || 'Assistencial',
      grau_risco: grau_risco || 'Médio',
      prazo_fatal: prazo_fatal || null,
      descricao: limpaDescricao,
      responsavel_atribuido: responsavel_atribuido || 'Comissão de Auditoria',
      unidade_id: limpaUnidadeId
    };

    if (status) payload.status = status;
    if (esfera_gestao) payload.esfera_gestao = esfera_gestao;

    let { data, error } = await supabase
      .from('demandas')
      .update(payload)
      .eq('id', id)
      .select();

    // Fallback se a coluna esfera_gestao não existir
    if (error && error.message && error.message.includes('esfera_gestao')) {
      delete payload.esfera_gestao;
      const fallback = await supabase
        .from('demandas')
        .update(payload)
        .eq('id', id)
        .select();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Erro ao atualizar demanda no Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    const atualizado = (data && data[0]) ? data[0] : { ...payload, id };
    res.json(atualizado);
  } catch (err) {
    console.error('Erro interno ao atualizar demanda:', err);
    res.status(500).json({ error: err.message });
  }
};

app.put('/api/demandas/:id', atualizarDemandaHandler);
app.patch('/api/demandas/:id', atualizarDemandaHandler);
app.post('/api/demandas/:id', atualizarDemandaHandler);

// Atualizar situação rápida da demanda (Triagem, Em andamento, Concluída, Arquivada)
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

    if (error && error.message && error.message.includes('data_conclusao')) {
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

// Adicionar despacho ao histórico
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

// Excluir demanda
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
    console.error('Erro ao excluir demanda:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. ROTAS DE UNIDADES DE SAÚDE
// ==========================================

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

// ==========================================
// 3. ROTAS DE CONTATOS (SINCRONIZAÇÃO NUVEM)
// ==========================================

// Listar todos os contatos
app.get('/api/contatos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contatos')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro Supabase GET /contatos:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Erro interno GET /contatos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar novo contato
app.post('/api/contatos', async (req, res) => {
  const { nome, cargo, orgao_unidade, categoria, telefone, email, observacao } = req.body;
  try {
    if (!nome || !cargo) {
      return res.status(400).json({ error: 'Nome e cargo do contato são obrigatórios.' });
    }

    const payload = {
      nome: nome.trim(),
      cargo: cargo.trim(),
      orgao_unidade: (orgao_unidade || '').trim(),
      categoria: categoria || 'Direção Hospitalar',
      telefone: (telefone || '').trim(),
      email: (email || '').trim(),
      observacao: (observacao || '').trim()
    };

    const { data, error } = await supabase
      .from('contatos')
      .insert([payload])
      .select();

    if (error) {
      console.error('Erro Supabase POST /contatos:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro interno POST /contatos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar contato
app.put('/api/contatos/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, cargo, orgao_unidade, categoria, telefone, email, observacao } = req.body;
  try {
    const payload = {
      nome: nome?.trim(),
      cargo: cargo?.trim(),
      orgao_unidade: orgao_unidade?.trim(),
      categoria,
      telefone: telefone?.trim(),
      email: email?.trim(),
      observacao: observacao?.trim()
    };

    const { data, error } = await supabase
      .from('contatos')
      .update(payload)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro Supabase PUT /contatos:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (err) {
    console.error('Erro interno PUT /contatos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excluir contato
app.delete('/api/contatos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('contatos')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('Erro Supabase DELETE /contatos:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Contato excluído com sucesso', deletado: data });
  } catch (err) {
    console.error('Erro interno DELETE /contatos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SIS-FISA API online e pronta na porta ${PORT}`));
