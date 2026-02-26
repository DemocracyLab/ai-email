import { LLMConfig } from '../../shared/types';

export async function generateEmail(
  contextTemplate: string,
  llmConfig: LLMConfig
): Promise<string> {
  try {
    // Fetch API key from Secret Manager
    const apiKey = await window.electronAPI.getLLMApiKey();
    
    const configWithKey = {
      ...llmConfig,
      apiKey
    };
    
    if (configWithKey.provider === 'openai') {
      return await generateWithOpenAI(contextTemplate, configWithKey);
    } else if (configWithKey.provider === 'gemini') {
      return await generateWithGemini(contextTemplate, configWithKey);
    } else {
      throw new Error('Unsupported LLM provider');
    }
  } catch (error: any) {
    console.error('Email generation failed:', error.message);
    throw new Error(`Failed to generate email: ${error.message}`);
  }
}

async function generateWithOpenAI(
  contextTemplate: string,
  llmConfig: LLMConfig
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an email writing assistant. Generate a personalized email based on the provided context template.

FORMATTING RULES:
- The FIRST LINE of your output should be the subject line (without "Subject:" prefix)
- Use double newlines (blank lines) to separate distinct paragraphs
- Use single newlines for list items or lines that should be on separate lines but stay together visually
- The template may contain placeholders like {{firstName}} and {{lastName}} - leave these as-is in your output, they will be replaced later

Example formatting:
Paragraph one text here.

Paragraph two with a list:
1. First item
2. Second item
3. Third item

Paragraph three continues here.`
        },
        {
          role: 'user',
          content: `Context Template:\n${contextTemplate}\n\nGenerate a professional, personalized email.`
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('OpenAI API error:', error.error?.message || 'Request failed');
    throw new Error(error.error?.message || 'OpenAI API request failed');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function generateWithGemini(
  contextTemplate: string,
  llmConfig: LLMConfig
): Promise<string> {
  if (!llmConfig.model) {
    throw new Error('No model selected. Please fetch and select a model in Configuration.');
  }
  const model = llmConfig.model;
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${llmConfig.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are an email writing assistant. Generate a personalized email based on the provided context template.

FORMATTING RULES:
- The FIRST LINE of your output should be the subject line (without "Subject:" prefix)
- Use double newlines (blank lines) to separate distinct paragraphs
- Use single newlines for list items or lines that should be on separate lines but stay together visually
- The template may contain placeholders like {{firstName}} and {{lastName}} - leave these as-is in your output, they will be replaced later

Example formatting:
Paragraph one text here.

Paragraph two with a list:
1. First item
2. Second item
3. Third item

Paragraph three continues here.

Context Template:
${contextTemplate}

Generate a professional, personalized email.`
          }]
        }],
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE'
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8000,
          topP: 0.95,
          topK: 40
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error('Gemini API error:', error.error?.message || 'Request failed');
    throw new Error(error.error?.message || 'Gemini API request failed');
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}
