import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AIInsights {
  mensagemIA: string;
  resumo: {
    totalGasto: number;
    categoriaPrincipal: string;
    percentualPrincipal: number;
  };
  alertas: string[];
  insights: string[];
  oportunidades: {
    descricao: string;
    economiaEstimada: number;
  }[];
}

export async function getFinancialInsights(transactions: any[]): Promise<AIInsights> {
  const prompt = `
Você é uma Inteligência Artificial especialista em finanças pessoais.

Analise as transações abaixo, que representam os gastos e receitas de um usuário em um mês específico.

Seu objetivo é gerar insights claros, úteis e acionáveis.

REGRAS:
* Não seja genérico
* Não diga apenas "gaste menos"
* Seja direto
* Identifique padrões reais
* Sugira economia baseada nos dados
* Considere que os dados são de um único mês

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
          mensagemIA: { type: Type.STRING },
          resumo: {
            type: Type.OBJECT,
            properties: {
              totalGasto: { type: Type.NUMBER },
              categoriaPrincipal: { type: Type.STRING },
              percentualPrincipal: { type: Type.NUMBER },
            },
            required: ["totalGasto", "categoriaPrincipal", "percentualPrincipal"],
          },
          alertas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          insights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
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
          },
        },
        required: ["mensagemIA", "resumo", "alertas", "insights", "oportunidades"],
      },
    },
  });

  return JSON.parse(response.text);
}
