import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AIInsights {
  mensagemIA: string;
  pontoAtencao: string;
  resumo: {
    totalGasto: number;
    categoriaPrincipal: string;
    percentualPrincipal: number;
  };
  insights: string[];
  oportunidades: {
    descricao: string;
    economiaEstimada: number;
  }[];
  totalEconomiaEstimada: number;
}

export async function getFinancialInsights(transactions: any[]): Promise<AIInsights> {
  const prompt = `
Você é uma Inteligência Artificial especialista em finanças pessoais, conversando com um amigo.

Analise as transações abaixo, que representam os gastos e receitas de um usuário em um mês específico.

Seu objetivo é gerar insights claros, úteis e acionáveis, com um tom natural e amigável, mas realista.

REGRAS DE ANÁLISE E TOM:
- Destaque claramente o PRINCIPAL PROBLEMA do mês no campo "pontoAtencao". Não minimize falhas.
- Evite elogiar demais ou ser excessivamente otimista se houver pontos críticos ou descontrole financeiro.
- As "oportunidades" devem focar em REDUÇÃO real de gastos (cortes, substituições, economia direta), não apenas em organização ou categorização.
- Não use linguagem técnica ou corporativa.
- Use expressões como "percebi que...", "notei que...", "vale atenção em...".

ESTRUTURA DA ANÁLISE:
1. RESUMO DO MÊS: Explique em até 2 ou 3 linhas como foi o comportamento financeiro (campo: mensagemIA).
2. PRINCIPAL PONTO DE ATENÇÃO: Uma frase curta e direta sobre o maior problema identificado (campo: pontoAtencao).
3. INSIGHTS E ALERTAS: Liste de 3 a 5 pontos importantes, com frases curtas (campo: insights).
4. OPORTUNIDADES DE ECONOMIA: Sugira de 2 a 4 ações práticas de REDUÇÃO de gastos, estimando economia em reais (campo: oportunidades).
5. ECONOMIA TOTAL ESTIMADA: A soma de todas as economias sugeridas nas oportunidades (campo: totalEconomiaEstimada).

Transações:
${JSON.stringify(transactions, null, 2)}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mensagemIA: { 
            type: Type.STRING,
            description: "Resumo do mês em 2-3 linhas com tom amigável e realista."
          },
          pontoAtencao: { 
            type: Type.STRING,
            description: "Frase direta sobre o maior problema financeiro do mês."
          },
          resumo: {
            type: Type.OBJECT,
            properties: {
              totalGasto: { type: Type.NUMBER },
              categoriaPrincipal: { type: Type.STRING },
              percentualPrincipal: { type: Type.NUMBER },
            },
            required: ["totalGasto", "categoriaPrincipal", "percentualPrincipal"],
          },
          insights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3 a 5 frases curtas com insights e alertas reais."
          },
          oportunidades: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                descricao: { type: Type.STRING },
                economiaEstimada: { type: Type.NUMBER },
              },
              required: ["descricao", "economiaEstimada"],
            },
            description: "2 a 4 ações práticas de REDUÇÃO de gastos."
          },
          totalEconomiaEstimada: {
            type: Type.NUMBER,
            description: "Soma total da economia estimada nas oportunidades sugeridas."
          }
        },
        required: ["mensagemIA", "pontoAtencao", "resumo", "insights", "oportunidades", "totalEconomiaEstimada"],
      },
    },
  });

  return JSON.parse(response.text);
}
