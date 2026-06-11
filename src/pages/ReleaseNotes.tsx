import React from 'react';
import { Tag, CheckCircle2, Wrench, Download, Upload } from 'lucide-react';

const releases = [
  {
    version: '1.0.0',
    date: '10 de Junho de 2026',
    features: [
      'Lançamento inicial da aplicação.',
      'Gestão de transações de entrada e saída.',
      'Suporte para transações recorrentes e parceladas.',
      'Categorização de despesas e receitas.',
      'Dashboards interativos com gráficos e resumos.',
      'Menu de ajustes para gerenciar categorias e preferências.'
    ],
    fixes: [],
    improvements: []
  },
  {
    version: '1.0.1',
    date: '10 de Junho de 2026',
    features: [
      'Nova funcionalidade de Backup de Dados: Agora é possível exportar todos os seus dados para um arquivo JSON e importá-los quando precisar.',
      'Nova seção de "Versões" (Release Notes) para acompanhar as atualizações.'
    ],
    fixes: [
      'Correção de bug na importação de backup (limite de escritas em lote excedido resolvido).',
      'Corrigidas regras de criação e atualização para respeitar os criadores e proprietários dos dados.'
    ],
    improvements: [
      'Otimizada a tela de configurações para suportar backups com segurança e feedbacks visuais.'
    ]
  }
];

export default function ReleaseNotes() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
          <Tag className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Versões do Sistema</h1>
          <p className="text-sm text-gray-500">Acompanhe as atualizações, melhorias e correções da aplicação.</p>
        </div>
      </div>

      <div className="space-y-6">
        {[...releases].reverse().map((release) => (
          <div key={release.version} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-bl-2xl font-semibold text-sm">
              v{release.version}
            </div>
            
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">Versão {release.version}</h2>
              <p className="text-sm text-gray-500">{release.date}</p>
            </div>

            <div className="space-y-6">
              {release.features && release.features.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-green-700 mb-3">
                    <CheckCircle2 className="w-5 h-5" />
                    Novidades
                  </h3>
                  <ul className="space-y-2">
                    {release.features.map((feature, idx) => (
                      <li key={idx} className="flex gap-2 text-gray-700 text-sm">
                        <span className="text-green-500 mt-0.5">•</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {release.improvements && release.improvements.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-blue-700 mb-3">
                    <Upload className="w-5 h-5" />
                    Melhorias
                  </h3>
                  <ul className="space-y-2">
                    {release.improvements.map((improvement, idx) => (
                      <li key={idx} className="flex gap-2 text-gray-700 text-sm">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {release.fixes && release.fixes.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-orange-700 mb-3">
                    <Wrench className="w-5 h-5" />
                    Correções
                  </h3>
                  <ul className="space-y-2">
                    {release.fixes.map((fix, idx) => (
                      <li key={idx} className="flex gap-2 text-gray-700 text-sm">
                        <span className="text-orange-500 mt-0.5">•</span>
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
