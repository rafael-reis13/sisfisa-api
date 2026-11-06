import React, { useState, useEffect } from 'react';
import { X, User, Briefcase, Building2, Phone, Mail, FileText, Check } from 'lucide-react';

export interface ContatoFormValues {
  id?: string;
  nome: string;
  cargo: string;
  orgao_setor: string;
  categoria: string;
  telefone: string;
  ramal?: string;
  email?: string;
  observacoes?: string;
}

interface ModalContatoProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dados: ContatoFormValues) => Promise<void> | void;
  contatoParaEditar?: ContatoFormValues | null;
}

const CATEGORIAS_OPCOES = [
  'Fiscalização',
  'Auditoria',
  'SMS / Gestão',
  'Prestadores / OS',
  'Jurídico / Controle',
  'Unidades de Saúde',
  'Outro'
];

export default function ModalContato({
  isOpen,
  onClose,
  onSave,
  contatoParaEditar
}: ModalContatoProps) {
  const [formData, setFormData] = useState<ContatoFormValues>({
    nome: '',
    cargo: '',
    orgao_setor: '',
    categoria: 'Fiscalização',
    telefone: '',
    ramal: '',
    email: '',
    observacoes: ''
  });

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Preenche ou reseta os campos ao abrir o modal
  useEffect(() => {
    if (contatoParaEditar) {
      setFormData(contatoParaEditar);
    } else {
      setFormData({
        nome: '',
        cargo: '',
        orgao_setor: '',
        categoria: 'Fiscalização',
        telefone: '',
        ramal: '',
        email: '',
        observacoes: ''
      });
    }
    setErro(null);
  }, [contatoParaEditar, isOpen]);

  if (!isOpen) return null;

  // Máscara dinâmica de telefone: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  const aplicarMascaraTelefone = (valor: string) => {
    const apenasDigitos = valor.replace(/\D/g, '').slice(0, 11);
    if (apenasDigitos.length <= 10) {
      return apenasDigitos.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
    }
    return apenasDigitos.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'telefone') {
      setFormData((prev) => ({ ...prev, telefone: aplicarMascaraTelefone(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!formData.nome.trim() || !formData.telefone.trim() || !formData.orgao_setor.trim()) {
      setErro('Por favor, preencha os campos obrigatórios (Nome, Órgão/Setor e Telefone).');
      return;
    }

    try {
      setSalvando(true);
      await onSave(formData);
      onClose();
    } catch (err) {
      setErro('Erro ao salvar contato. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {contatoParaEditar ? 'Editar Contato' : 'Novo Contato'}
            </h2>
            <p className="text-xs text-gray-500">
              {contatoParaEditar
                ? 'Atualize as informações do diretório'
                : 'Cadastre um novo contato na agenda do SIS-FISA'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erro && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg">
              {erro}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nome Completo *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                name="nome"
                required
                value={formData.nome}
                onChange={handleChange}
                placeholder="Ex: Dra. Mariana Costa"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Cargo e Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Cargo / Função
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  name="cargo"
                  value={formData.cargo}
                  onChange={handleChange}
                  placeholder="Ex: Fiscal de Contrato"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Categoria *
              </label>
              <select
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {CATEGORIAS_OPCOES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Órgão / Setor */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Órgão / Setor / Empresa *
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                name="orgao_setor"
                required
                value={formData.orgao_setor}
                onChange={handleChange}
                placeholder="Ex: Subsecretaria de Fiscalização / SMS"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Telefone e Ramal */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Telefone / WhatsApp *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  name="telefone"
                  required
                  value={formData.telefone}
                  onChange={handleChange}
                  placeholder="(22) 99999-9999"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ramal
              </label>
              <input
                type="text"
                name="ramal"
                value={formData.ramal || ''}
                onChange={handleChange}
                placeholder="Ex: 204"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-center"
              />
            </div>
          </div>

          {/* E-mail */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              E-mail Institucional
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="email"
                name="email"
                value={formData.email || ''}
                onChange={handleChange}
                placeholder="nome@saquarema.rj.gov.br"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Observações Adicionais
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <textarea
                name="observacoes"
                rows={2}
                value={formData.observacoes || ''}
                onChange={handleChange}
                placeholder="Ex: Horário de atendimento, responsável por notificações técnicas..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Rodapé e Botões */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {salvando ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  Salvar Contato
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
