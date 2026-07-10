import React from 'react';
import { Tag, CheckCircle2, Wrench, Download, Upload } from 'lucide-react';

const releases = [
  {
    version: '10/07/2026',
    date: '10 de Julho de 2026',
    features: [
      'Novo Relatório de Despesa Comparativo: Adicionado um novo módulo dinâmico que permite selecionar uma categoria de despesa e analisar sua evolução ao longo dos meses (com períodos de 3, 6, 12 meses ou ano corrente).',
      'Painel Estatístico Avançado: Visualização do valor total gasto no período, média mensal de despesas da categoria, e indicação do mês de maior recorde de gastos.',
      'Análise de Tendência Visual: Gráficos de barra integrados detalhando o comportamento de gastos da despesa selecionada ao longo do tempo.',
      'Tabela Interativa e Retráctil: Lista mensal detalhada por competência com cálculo de variação percentual dinâmica em relação ao mês anterior, e abertura detalhada das transações individuais de cada mês ao clicar.'
    ],
    fixes: [],
    improvements: [
      'Navegação por Abas: Implementação de abas de filtragem rápida na tela de Relatórios para alternar com elegância e fluidez entre a busca geral tradicional e o novo relatório comparativo de despesa.'
    ]
  },
  {
    version: '12/06/2026',
    date: '12 de Junho de 2026',
    features: [
      'Implementado novas opções de formatação no Relatório Completo PDF de despesas.',
      'Desenvolvimento do painel de Insights Rápidos (Destaques do Mês) integrado ao Dashboard, com detecção automática de métricas cruciais (maior despesa única, categoria recordista, gasto médio diário, margem de poupança) e bloco de conselho personalizado conforme as finanças do usuário.'
    ],
    fixes: [
      'Ordenamento cronológico de data crescente das despesas no relatório.',
      'Descrição das despesas estilizada em negrito para facilitar visualização.',
      'Valores das despesas estilizados em cor vermelha simbólica.',
      'Surgimento de quebras de página automáticas proporcionais que evitam orphan headers e garantem ótima densidade visual.'
    ],
    improvements: [
      'Redistribuição proporcional do painel de filtros em uma grade fluida de 12 colunas, garantindo excelente espaçamento para campos de datas e total legibilidade em qualquer tamanho de tela.'
    ]
  },
  {
    version: '11/06/2026',
    date: '11 de Junho de 2026',
    features: [
      'Adicionado botão "Filtrar" no módulo de relatórios para otimizar o desempenho do sistema ao aplicar filtros.'
    ],
    fixes: [
      'Rollback no módulo de relatórios para retirar o Gráfico de Evolução e restabelecer a estrutura original simplificada dos filtros e layout.',
      'Melhoria na disposição dos filtros na tela de Relatórios para melhor fluidez em telas diferentes.',
      'Ajuste visual no Gráfico de Evolução para um estilo mais limpo e legível (linhas retas, melhor marcação de pontos).',
      'Correção de erro "Invalid time value" no módulo de relatórios ao selecionar datas inválidas.',
      'Gráfico de evolução atualizado para utilizar visualização em linhas (Line Chart) também na aba Geral, alinhando com a visualização por categorias.'
    ],
    improvements: []
  },
  {
    version: '10/06/2026',
    date: '10 de Junho de 2026',
    features: [
      'Adicionado o Gráfico de Evolução no módulo de Relatórios.',
      'Possibilidade de acompanhar a evolução mensal em duas visões: Geral (comparando totais de Receitas e Despesas) ou Por Categorias.',
      'Adicionada opção de ordenação na tela de importação de CSV. Agora é possível classificar a lista de transações a serem importadas por data, descrição, categoria, responsável e valor.',
      'Na tela de importação de CSV, agora o botão "Mês Atual" fica disponível para qualquer despesa (não apenas nas parceladas) que esteja em um mês diferente da visualização atual da importação.',
      'Nova funcionalidade de Backup de Dados: Agora é possível exportar todos os seus dados para um arquivo JSON e importá-los quando precisar.',
      'Nova seção de "Versões" (Release Notes) para acompanhar as atualizações.',
      'Lançamento inicial da aplicação.',
      'Gestão de transações de entrada e saída.',
      'Suporte para transações recorrentes e parceladas.',
      'Categorização de despesas e receitas.',
      'Dashboards interativos com gráficos e resumos.',
      'Menu de ajustes para gerenciar categorias e preferências.'
    ],
    fixes: [
      'Aprimorada a identificação de categorias na importação de faturas via CSV. O sistema agora verifica seu histórico para encontrar categorias de despesas equivalentes.',
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
          <p className="text-sm text-gray-500">Acompanhe as atualizações, melhorias e correções da aplicação agrupadas por data.</p>
        </div>
      </div>

      <div className="space-y-6">
        {releases.map((release) => (
          <div key={release.version} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-bl-2xl font-semibold text-xs">
              {release.version}
            </div>
            
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">Atualização de {release.date}</h2>
              <p className="text-sm text-gray-500 text-blue-600/80 font-medium">Melhorias e ajustes do dia</p>
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
