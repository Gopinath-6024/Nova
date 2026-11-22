import express, { type Request, type Response, type Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

export interface LanguageRouteDeps {
  getAiClient: (apiVersion?: string) => GoogleGenAI;
  getGeminiErrorStatus: (err: unknown) => { status: number; message: string; paidKeyRequired?: boolean };
  recordApiTelemetry: (
    endpoint: string,
    model: string,
    status: number,
    latencyMs: number,
    ok: boolean,
    message: string
  ) => void;
}

const LANGUAGE_LABELS: Record<string, string> = {
  ja: 'Japanese',
  en: 'English',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  zh: 'Chinese (Mandarin)',
  it: 'Italian',
  pt: 'Portuguese',
  hi: 'Hindi',
  ta: 'Tamil',
};

function labelFor(code: string): string {
  return LANGUAGE_LABELS[code] || code || 'English';
}

const TEXT_MODEL_PRIMARY = 'gemini-4-hydrogen';
const TEXT_MODEL_FAST = 'gemini-3.1-flash-lite';

async function generateStructuredJson(
  ai: GoogleGenAI,
  params: {
    model: string;
    systemInstruction: string;
    prompt: string;
    schema: Record<string, unknown>;
    temperature?: number;
  }
) {
  try {
    return await ai.models.generateContent({
      model: params.model,
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
      config: {
        systemInstruction: params.systemInstruction,
        temperature: params.temperature ?? 0.5,
        responseMimeType: 'application/json',
        responseSchema: params.schema,
      },
    });
  } catch (err) {
    // Retry once on fast sibling model if primary hits transient overload
    if (params.model !== TEXT_MODEL_FAST) {
      return await ai.models.generateContent({
        model: TEXT_MODEL_FAST,
        contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
        config: {
          systemInstruction: params.systemInstruction,
          temperature: params.temperature ?? 0.5,
          responseMimeType: 'application/json',
          responseSchema: params.schema,
        },
      });
    }
    throw err;
  }
}

const EXERCISE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    kind: {
      type: Type.STRING,
      description: 'One of: multiple_choice, sentence_builder, script_match, typing_translate, listening, speaking',
    },
    skill: {
      type: Type.STRING,
      description: 'Hiragana, Katakana, Kanji, Script, Vocabulary, Grammar, Sentence Formation, Listening, Speaking, Checkpoint, or Revision',
    },
    promptNative: { type: Type.STRING },
    promptTarget: { type: Type.STRING },
    romanization: { type: Type.STRING },
    audioText: { type: Type.STRING },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    correctAnswer: { type: Type.STRING },
    acceptedAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
    wordBank: { type: Type.ARRAY, items: { type: Type.STRING } },
    matchPairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          left: { type: Type.STRING },
          right: { type: Type.STRING },
        },
        required: ['id', 'left', 'right'],
      },
    },
    grammarTip: { type: Type.STRING },
  },
  required: ['id', 'kind', 'skill', 'promptNative', 'correctAnswer', 'grammarTip'],
};

const LESSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    chapterId: { type: Type.STRING },
    title: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    skill: { type: Type.STRING },
    lessonKind: { type: Type.STRING },
    xpReward: { type: Type.NUMBER },
    estimatedMinutes: { type: Type.NUMBER },
    exercises: {
      type: Type.ARRAY,
      items: EXERCISE_SCHEMA,
    },
  },
  required: ['id', 'chapterId', 'title', 'subtitle', 'skill', 'lessonKind', 'xpReward', 'estimatedMinutes', 'exercises'],
};

export function createLanguageRouter(deps: LanguageRouteDeps): Router {
  const router = express.Router();

  // 1. Generate personalized curriculum unit (Chapters -> Lessons -> Checkpoint)
  router.post('/generate-path', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const ai = deps.getAiClient();
      const {
        targetLanguage = 'ja',
        nativeLanguage = 'en',
        level = 'Beginner',
        unitNumber = 3,
        focusTopic = '',
      } = req.body ?? {};

      const targetName = labelFor(String(targetLanguage));
      const nativeName = labelFor(String(nativeLanguage));
      const cleanLevel = String(level).slice(0, 48);
      const cleanUnitNum = Math.max(1, Math.min(20, Number(unitNumber) || 3));
      const topicHint = String(focusTopic || '').trim().slice(0, 120);

      const unitSchema = {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          unitNumber: { type: Type.NUMBER },
          title: { type: Type.STRING },
          cefrOrLevel: { type: Type.STRING },
          description: { type: Type.STRING },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                focusSkill: { type: Type.STRING },
                description: { type: Type.STRING },
                lessons: {
                  type: Type.ARRAY,
                  items: LESSON_SCHEMA,
                },
              },
              required: ['id', 'title', 'focusSkill', 'description', 'lessons'],
            },
          },
        },
        required: ['id', 'unitNumber', 'title', 'cefrOrLevel', 'description', 'chapters'],
      };

      const japaneseRules =
        targetLanguage === 'ja'
          ? 'Include Hiragana, Katakana, Kanji (with readings), Grammar, Sentence Formation (particles like は, を, に, で, が), Listening, and Speaking exercises.'
          : 'Include Vocabulary, Grammar, Sentence Formation, Listening, Speaking, and Script practice.';

      const prompt = [
        `Design Unit ${cleanUnitNum} of an interactive Duolingo-style course teaching ${targetName} to a native ${nativeName} speaker at "${cleanLevel}" proficiency.`,
        topicHint ? `Focus theme: ${topicHint}.` : '',
        japaneseRules,
        'Structure cleanly into 2 chapters, each having 2 lessons (total 4 lessons, making the final lesson either lessonKind "checkpoint" or "revision").',
        'Each lesson must contain 3 to 4 varied interactive exercises.',
        'For sentence_builder: provide wordBank (including 1-2 distractors) and exact space-joined tokens in correctAnswer.',
        'For multiple_choice and listening: provide 4 options where correctAnswer is verbatim one of the options, and set audioText to the target language sentence.',
        'For speaking: set promptTarget and audioText to the phrase to say aloud, romanization for pronunciation guide, and acceptedAnswers.',
        'Write all promptNative and grammarTip text cleanly in ' + nativeName + '.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await generateStructuredJson(ai, {
        model: TEXT_MODEL_FAST,
        systemInstruction:
          'You are an expert applied linguist and curriculum architect building interactive Duolingo-style lessons. Output strictly valid JSON matching the schema.',
        prompt,
        schema: unitSchema,
        temperature: 0.45,
      });

      const unit = JSON.parse(response.text || '{}');
      unit.unitNumber = cleanUnitNum;
      unit.cefrOrLevel = cleanLevel;
      if (!unit.id) unit.id = `${targetLanguage}-ai-u${cleanUnitNum}-${Date.now()}`;

      deps.recordApiTelemetry('/api/nova/languages/generate-path', TEXT_MODEL_FAST, 200, Date.now() - startMs, true, 'Generated unit');
      res.json({ unit });
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/languages/generate-path', TEXT_MODEL_FAST, status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  // 2. Generate targeted custom lesson, checkpoint, or mistake revision session
  router.post('/generate-lesson', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const ai = deps.getAiClient();
      const {
        targetLanguage = 'ja',
        nativeLanguage = 'en',
        level = 'Beginner',
        lessonKind = 'revision',
        focusSkill = 'Mixed',
        weakTerms = [],
      } = req.body ?? {};

      const targetName = labelFor(String(targetLanguage));
      const nativeName = labelFor(String(nativeLanguage));
      const termsList = Array.isArray(weakTerms) ? weakTerms.slice(0, 12).map(String) : [];

      const prompt = [
        `Create a 5-exercise interactive ${lessonKind} lesson teaching ${targetName} for a ${level} learner whose native language is ${nativeName}.`,
        `Primary skill focus: ${focusSkill}.`,
        termsList.length > 0 ? `Weave in these review words/concepts: ${termsList.join(', ')}.` : '',
        'Mix exercise kinds across multiple_choice, sentence_builder, script_match (if non-Latin/Kanji or pairs), listening, and speaking.',
        'For script_match set correctAnswer to "all-matched" and include 4 matchPairs ({id, left, right}).',
        'Provide clear grammarTip and promptNative in ' + nativeName + ', and accurate romanization/phonetics.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await generateStructuredJson(ai, {
        model: TEXT_MODEL_FAST,
        systemInstruction:
          'You are NOVA Language AI Coach. Generate accurate, engaging language drills strictly following the JSON schema.',
        prompt,
        schema: LESSON_SCHEMA,
        temperature: 0.45,
      });

      const lesson = JSON.parse(response.text || '{}');
      if (!lesson.id) lesson.id = `ai-lesson-${Date.now()}`;
      lesson.chapterId = lesson.chapterId || 'ai-custom';

      deps.recordApiTelemetry('/api/nova/languages/generate-lesson', TEXT_MODEL_FAST, 200, Date.now() - startMs, true, 'Generated lesson');
      res.json({ lesson });
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/languages/generate-lesson', TEXT_MODEL_FAST, status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  // 3. Explain an exercise or grammar point on demand inside a lesson
  router.post('/explain-exercise', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const ai = deps.getAiClient();
      const {
        targetLanguage = 'ja',
        nativeLanguage = 'en',
        level = 'Beginner',
        promptNative = '',
        promptTarget = '',
        userAnswer = '',
        correctAnswer = '',
        question = '',
      } = req.body ?? {};

      const targetName = labelFor(String(targetLanguage));
      const nativeName = labelFor(String(nativeLanguage));

      const response = await ai.models.generateContent({
        model: TEXT_MODEL_PRIMARY,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  `Student native language: ${nativeName}. Target language: ${targetName}. Level: ${level}.`,
                  `Exercise prompt: ${promptNative}`,
                  promptTarget ? `Target phrase: ${promptTarget}` : '',
                  `Correct answer: ${correctAnswer}`,
                  userAnswer ? `Student answered: ${userAnswer}` : '',
                  question ? `Student asks: ${question}` : 'Explain clearly why this answer works, break down key particles/grammar or characters, and give 1 memorable tip.',
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ],
          },
        ],
        config: {
          systemInstruction: `You are an encouraging, crystal-clear ${targetName} language teacher replying concisely in ${nativeName}.`,
          temperature: 0.4,
        },
      });

      deps.recordApiTelemetry('/api/nova/languages/explain-exercise', TEXT_MODEL_PRIMARY, 200, Date.now() - startMs, true, 'Explained');
      res.json({ explanation: (response.text || '').trim() });
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/languages/explain-exercise', TEXT_MODEL_PRIMARY, status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  // 4. Interactive Bilingual AI Tutor & Roleplay Chat
  router.post('/tutor-chat', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const ai = deps.getAiClient();
      const {
        targetLanguage = 'ja',
        nativeLanguage = 'en',
        level = 'Beginner',
        scenario = 'Free Practice & Grammar Coaching',
        message = '',
        history = [],
      } = req.body ?? {};

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Missing tutor message.' });
        return;
      }

      const targetName = labelFor(String(targetLanguage));
      const nativeName = labelFor(String(nativeLanguage));

      const tutorSchema = {
        type: Type.OBJECT,
        properties: {
          textTarget: {
            type: Type.STRING,
            description: `Natural conversational reply in ${targetName}, level-appropriate for ${level}.`,
          },
          phonetics: {
            type: Type.STRING,
            description: 'Romaji / Pinyin / phonetic reading of textTarget (or pronunciation aid).',
          },
          translationNative: {
            type: Type.STRING,
            description: `Clear translation of textTarget into ${nativeName}.`,
          },
          correction: {
            type: Type.STRING,
            description: `Gentle correction & explanation in ${nativeName} if the learner made a mistake, or praise if natural.`,
          },
          grammarNotes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '1 to 3 bite-sized vocabulary or grammar takeaways from this exchange.',
          },
        },
        required: ['textTarget', 'phonetics', 'translationNative', 'correction', 'grammarNotes'],
      };

      const compactHistory = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h: { role?: string; textTarget?: string; translationNative?: string }) =>
              `${h.role === 'user' ? 'Learner' : 'Teacher'}: ${h.textTarget || ''}`
            )
            .join('\n')
        : '';

      const response = await generateStructuredJson(ai, {
        model: TEXT_MODEL_PRIMARY,
        systemInstruction: `You are NOVA Language AI Teacher (${targetName} specialist). Match "${level}" complexity. Active scenario: ${scenario}. Keep replies warm, practical, and structured.`,
        prompt: [
          compactHistory ? `Recent dialogue:\n${compactHistory}` : '',
          `Learner message: ${message}`,
          `Respond in ${targetName} (with phonetics + ${nativeName} translation + helpful correction/praise in ${nativeName}).`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        schema: tutorSchema,
        temperature: 0.55,
      });

      const parsed = JSON.parse(response.text || '{}');
      deps.recordApiTelemetry('/api/nova/languages/tutor-chat', TEXT_MODEL_PRIMARY, 200, Date.now() - startMs, true, 'Tutor reply');
      res.json(parsed);
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/languages/tutor-chat', TEXT_MODEL_PRIMARY, status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  // 5. Evaluate Speaking / Pronunciation (Audio via gemini-3.5-transcribe + AI phonetic coach)
  router.post('/evaluate-speaking', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const ai = deps.getAiClient();
      const {
        audioBase64,
        mimeType = 'audio/webm',
        spokenTranscript = '',
        expectedPhrase = '',
        targetLanguage = 'ja',
        nativeLanguage = 'en',
        level = 'Beginner',
      } = req.body ?? {};

      if (!expectedPhrase) {
        res.status(400).json({ error: 'Missing expectedPhrase.' });
        return;
      }

      let transcript = String(spokenTranscript || '').trim();
      const targetName = labelFor(String(targetLanguage));
      const nativeName = labelFor(String(nativeLanguage));

      if (audioBase64 && typeof audioBase64 === 'string') {
        const trRes = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              { inlineData: { mimeType: String(mimeType), data: audioBase64 } },
              {
                text: `Transcribe this learner's spoken ${targetName} audio accurately as text in ${targetName} script (if non-native/accented, transcribe the closest syllables heard). Return only the transcript.`,
              },
            ],
          },
        });
        transcript = (trRes.text || '').trim() || transcript;
      }

      if (!transcript) {
        res.status(400).json({ error: 'No speech detected. Try recording slightly closer or type your attempt.' });
        return;
      }

      const evalSchema = {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: '0 to 100 pronunciation & accuracy score' },
          passed: { type: Type.BOOLEAN },
          feedbackNative: { type: Type.STRING, description: `Actionable feedback in ${nativeName}` },
          tipTarget: { type: Type.STRING, description: 'Phonetic breakdown or intonation/pitch tip' },
          improvedPhrase: { type: Type.STRING },
        },
        required: ['score', 'passed', 'feedbackNative', 'tipTarget', 'improvedPhrase'],
      };

      const evalRes = await generateStructuredJson(ai, {
        model: TEXT_MODEL_FAST,
        systemInstruction: `You are a supportive ${targetName} pronunciation and speaking coach for a ${level} learner. Evaluate semantically and phonetically (treat romaji/pinyin or kanji/kana equivalents fairly when spoken accuracy matches).`,
        prompt: [
          `Target phrase: ${expectedPhrase}`,
          `Learner spoken transcript: ${transcript}`,
          `Provide score (0-100), passed (>= 65), warm feedback in ${nativeName}, and a clear pronunciation tip.`,
        ].join('\n'),
        schema: evalSchema,
        temperature: 0.3,
      });

      const parsed = JSON.parse(evalRes.text || '{}');
      deps.recordApiTelemetry('/api/nova/languages/evaluate-speaking', TEXT_MODEL_FAST, 200, Date.now() - startMs, true, 'Evaluated speaking');
      res.json({
        transcript,
        score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
        passed: Boolean(parsed.passed),
        feedbackNative: parsed.feedbackNative || '',
        tipTarget: parsed.tipTarget || '',
        improvedPhrase: parsed.improvedPhrase || expectedPhrase,
      });
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/languages/evaluate-speaking', TEXT_MODEL_FAST, status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  // 6. Multilingual Gemini TTS Audio Playback (normal / slow clear speed)
  router.post('/speak', async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const { text, targetLanguage = 'ja', speed = 'normal' } = req.body ?? {};
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Missing text to pronounce.' });
        return;
      }

      const langName = labelFor(String(targetLanguage));
      const trimmed = text.trim().slice(0, 500);
      const style =
        speed === 'slow'
          ? `Patient ${langName} language teacher pronouncing every syllable slowly, distinctly, and warmly`
          : `Natural fluent native ${langName} speaker with warm, clear articulation`;

      const ttsAttempts = [
        { apiVersion: 'v1alpha', withMetadata: true },
        { apiVersion: 'v1beta', withMetadata: false },
      ];

      let response;
      let lastErr: unknown;
      for (const attempt of ttsAttempts) {
        try {
          const ttsAi = deps.getAiClient(attempt.apiVersion);
          response = await ttsAi.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  attempt.withMetadata
                    ? { text: trimmed, speechMetadata: { style } }
                    : { text: `${style}: ${trimmed}` },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
          });
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('INVALID_ARGUMENT') || msg.includes('400')) continue;
          throw err;
        }
      }

      if (!response) throw lastErr || new Error('Language speech synthesis failed.');
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio generated.' });
        return;
      }

      deps.recordApiTelemetry('/api/nova/languages/speak', 'gemini-3.8-flash-lite-tts', 200, Date.now() - startMs, true, 'Language TTS');
      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/languages/speak', 'gemini-3.8-flash-lite-tts', status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
