import type {
  AdaptedCommandCode,
  DeviceControlsState,
  MobileIndexItem,
  NovaToolAction,
  QuickCommandKey,
  TaskItem,
} from '../types/nova';

function parseDeviceAndAlarmCommands(text: string): NovaToolAction[] {
  const lower = text.toLowerCase().trim();
  const actions: NovaToolAction[] = [];

  // Alarm detection (e.g. "set alarm for 7:30", "alarm 06:45 pm")
  const alarmMatch = lower.match(
    /(?:set\s+an?\s+alarm|set\s+alarm|alarm|wake\s*me)\s*(?:for|at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (alarmMatch) {
    let hour = parseInt(alarmMatch[1], 10);
    const min = alarmMatch[2] ? alarmMatch[2].padStart(2, '0') : '00';
    const meridiem = alarmMatch[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    const time24 = `${String(Math.min(23, Math.max(0, hour))).padStart(2, '0')}:${min}`;
    actions.push({
      type: 'setAlarm',
      args: { action: 'set', time: time24, label: 'Nova Alarm' },
      resultText: `Alarm set for ${time24}.`,
    });
  }

  // Device toggles
  const turnOn = /\b(on|enable|activate|start|open)\b/.test(lower);
  const turnOff = /\b(off|disable|mute|stop|close)\b/.test(lower);
  const toggleBool = turnOff ? false : turnOn ? true : undefined;

  const settingMap: Array<[RegExp, string]> = [
    [/wi-?fi/, 'wifi'],
    [/bluetooth/, 'bluetooth'],
    [/do not disturb|\bdnd\b/, 'dnd'],
    [/flashlight|torch/, 'flashlight'],
    [/battery\s*saver|power\s*sav/, 'batterySaver'],
    [/airplane\s*mode|flight\s*mode/, 'airplaneMode'],
    [/\blocation\b|\bgps\b/, 'location'],
    [/auto-?sync/, 'autoSync'],
  ];

  for (const [regex, key] of settingMap) {
    if (regex.test(lower)) {
      actions.push({
        type: 'controlDeviceSetting',
        args: {
          setting: key,
          ...(toggleBool !== undefined ? { booleanValue: toggleBool } : {}),
        },
        requiresBiometric: key === 'location' || key === 'airplaneMode',
        resultText: `Updated ${key}${
          toggleBool !== undefined ? ` to ${toggleBool ? 'ON' : 'OFF'}` : ''
        }.`,
      });
    }
  }

  const numMatch = lower.match(/(brightness|volume)\s*(?:to|at)?\s*(\d{1,3})/);
  if (numMatch) {
    const val = Math.min(100, Math.max(0, parseInt(numMatch[2], 10)));
    actions.push({
      type: 'controlDeviceSetting',
      args: { setting: numMatch[1], numericValue: val },
      resultText: `Set ${numMatch[1]} to ${val}%.`,
    });
  }

  return actions;
}

/**
 * Instant (<5ms) command dispatcher used EVEN ONLINE for deterministic codes,
 * passkeys, simple device toggles, and direct alarms so replies feel instantaneous.
 */
export function tryInstantLocalCommand(params: {
  text: string;
  adaptedCodes: AdaptedCommandCode[];
  commandKeys: QuickCommandKey[];
}): {
  reply: string;
  actions: NovaToolAction[];
  passkeyUsed?: QuickCommandKey;
} | null {
  const { text, adaptedCodes, commandKeys } = params;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Never intercept complex multi-clause prompts asking for generative pictures/PDFs/web info
  const hasGenerativeOrSearchIntent =
    /\b(generate|create|draw|sketch|paint|make|write|pdf|picture|pic|image|wallpaper|art|artwork|illustration|poster|portrait|review|explain|why|how|what|who|search|download)\b/i.test(
      lower
    ) && !lower.startsWith('#') && !lower.startsWith('!nk_') && !lower.startsWith('nk_');

  // 1. Check Nova Command Passkeys (e.g. nk_... or !nk_...)
  const cleanedKey = lower.replace(/^!/, '');
  const matchedPasskey = commandKeys.find(
    (k) => cleanedKey === k.passkey.toLowerCase() || lower.includes(k.passkey.toLowerCase())
  );
  if (matchedPasskey) {
    const parsedActions = parseDeviceAndAlarmCommands(matchedPasskey.commandPrompt);
    if (matchedPasskey.operationType === 'security-lockdown') {
      parsedActions.push(
        {
          type: 'controlDeviceSetting',
          args: { setting: 'dnd', booleanValue: true },
          resultText: 'Do Not Disturb enabled.',
        },
        {
          type: 'runSecurityAudit',
          args: { scanType: 'quick' },
          resultText: 'Started rapid mobile security sweep.',
        }
      );
    } else if (matchedPasskey.operationType === 'generate-pdf') {
      parsedActions.push({
        type: 'generatePdfDocument',
        args: {
          topic: matchedPasskey.commandPrompt,
          title: matchedPasskey.label,
          tone: 'concise',
        },
        resultText: `Generated PDF "${matchedPasskey.label}".`,
      });
    } else if (matchedPasskey.operationType === 'generate-art') {
      parsedActions.push({
        type: 'generateVectorArt',
        args: {
          prompt: matchedPasskey.commandPrompt,
          aspectRatio: '9:16',
        },
        resultText: `Generated vector wallpaper "${matchedPasskey.label}".`,
      });
    }
    return {
      reply: `Executed Command Passkey ${matchedPasskey.passkey} (${matchedPasskey.label}).`,
      actions: parsedActions,
      passkeyUsed: matchedPasskey,
    };
  }

  // 2. Check Adapted Command Codes (e.g. #focus)
  const matchedCode = adaptedCodes.find(
    (c) => lower === c.code.toLowerCase() || (lower.startsWith('#') && lower.includes(c.code.toLowerCase()))
  );
  if (matchedCode) {
    const actions: NovaToolAction[] = [];
    for (const act of matchedCode.actions) {
      if (act.setting) {
        actions.push({
          type: 'controlDeviceSetting',
          args: {
            setting: act.setting,
            ...(act.booleanValue !== undefined ? { booleanValue: act.booleanValue } : {}),
            ...(act.numericValue !== undefined ? { numericValue: act.numericValue } : {}),
          },
          requiresBiometric: act.setting === 'location' || act.setting === 'airplaneMode',
          resultText: `Executed "${matchedCode.code}" (${act.setting}).`,
        });
      }
      if (act.alarmTime) {
        actions.push({
          type: 'setAlarm',
          args: {
            action: 'set',
            time: act.alarmTime,
            label: act.alarmLabel || matchedCode.code,
          },
          resultText: `Alarm set for ${act.alarmTime}.`,
        });
      }
    }
    if (actions.length > 0) {
      return {
        reply: `Instant Code ${matchedCode.code}: ${matchedCode.description}`,
        actions,
      };
    }
  }

  // 3. Direct short device/alarm command (< 9 words, no AI generation/question words)
  if (!hasGenerativeOrSearchIntent && trimmed.split(/\s+/).length <= 9) {
    const directActions = parseDeviceAndAlarmCommands(trimmed);
    if (directActions.length > 0) {
      return {
        reply: `Done — ${directActions.map((a) => a.resultText).join(' ')}`,
        actions: directActions,
      };
    }
  }

  // 4. Instant <2ms pure arithmetic calculator (only pure numeric expressions, never word problems)
  if (activePureArithmetic(trimmed) !== null) {
    const calcResult = activePureArithmetic(trimmed)!;
    return {
      reply: `**${calcResult.formatted}** (${calcResult.expression} = ${calcResult.formatted})`,
      actions: [],
    };
  }

  return null;
}

function activePureArithmetic(raw: string): { expression: string; formatted: string } | null {
  const cleaned = raw
    .trim()
    .replace(/^(?:calc|calculate|compute|what\s+is|solve)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();

  // Percentage shorthand: "15% of 280"
  const pctMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)$/i);
  if (pctMatch) {
    const a = Number(pctMatch[1]);
    const b = Number(pctMatch[2]);
    const val = (a / 100) * b;
    if (Number.isFinite(val)) {
      return {
        expression: `${a}% × ${b}`,
        formatted: Number.isInteger(val) ? String(val) : Number(val.toFixed(6)).toString(),
      };
    }
  }

  const expr = cleaned.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
  if (!/^[\d\s+\-*/().]+$/.test(expr) || !/[+\-*/]/.test(expr)) {
    return null;
  }
  try {
    const val = new Function(`return (${expr});`)();
    if (typeof val === 'number' && Number.isFinite(val)) {
      return {
        expression: cleaned,
        formatted: Number.isInteger(val) ? String(val) : Number(val.toFixed(6)).toString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function processOfflineRequest(params: {
  text: string;
  device: DeviceControlsState;
  tasks: TaskItem[];
  mobileIndex: MobileIndexItem[];
  adaptedCodes: AdaptedCommandCode[];
  commandKeys?: QuickCommandKey[];
}): {
  reply: string;
  actions: NovaToolAction[];
} {
  const { text, tasks, mobileIndex, adaptedCodes, commandKeys = [] } = params;
  const instant = tryInstantLocalCommand({ text, adaptedCodes, commandKeys });
  if (instant) {
    return { reply: `Offline Edge: ${instant.reply}`, actions: instant.actions };
  }

  const lower = text.toLowerCase().trim();
  const actions: NovaToolAction[] = [];

  // Teach / Adapt a new code offline
  const adaptMatch = text.match(/adapt\s+code\s+([#\w-]+)\s*[:=-]\s*(.+)/i);
  if (adaptMatch) {
    const code = adaptMatch[1].trim();
    const desc = adaptMatch[2].trim();
    actions.push({
      type: 'adaptCommandCode',
      args: { code, description: desc },
      resultText: `Saved new adapted command code "${code}".`,
    });
    return {
      reply: `Got it! I saved "${code}" locally in your private vault so it works even offline.`,
      actions,
    };
  }

  // Device controls & alarms (full offline parsing)
  const parsed = parseDeviceAndAlarmCommands(text);
  if (parsed.length > 0) {
    return {
      reply: `Offline Edge: Done — ${parsed.map((a) => a.resultText).join(' ')}`,
      actions: parsed,
    };
  }

  // Task / Reminder creation
  const taskMatch = text.match(/(?:remind me to|add task|todo)\s+(.+)/i);
  if (taskMatch) {
    const title = taskMatch[1].trim();
    actions.push({
      type: 'manageTask',
      args: { action: 'add', title, dueTime: 'Today', priority: 'medium', category: 'personal' },
      resultText: `Added task "${title}".`,
    });
    return {
      reply: `Offline Edge: Saved "${title}" to your private task list.`,
      actions,
    };
  }

  // Vector Art / AI Picture / Wallpaper creation offline
  if (
    (/\b(picture|pictures|pic|pics|image|images|photo|wallpaper|wallpapers|art|artwork|artworks|illustration|illustrations|drawing|sketch|paint|painting|poster|portrait|logo|avatar)\b/.test(
      lower
    ) &&
      /\b(make|create|generate|draw|build|render|design|paint|sketch|give|show)\b/.test(lower)) ||
    /^(draw|sketch|paint)\s+/i.test(lower)
  ) {
    const ratio = /\b(wallpaper|phone|portrait|vertical|9:16)\b/.test(lower)
      ? '9:16'
      : /\b(landscape|banner|wide|16:9|desktop|laptop)\b/.test(lower)
      ? '16:9'
      : '1:1';
    actions.push({
      type: 'generateVectorArt',
      args: { prompt: text, aspectRatio: ratio },
      resultText: 'Generated custom AI vector artwork locally.',
    });
    return {
      reply: `Offline Edge: Generated custom AI artwork for "${text.slice(0, 60)}" locally without needing network access.`,
      actions,
    };
  }

  // PDF creation offline
  if (/\b(pdf|document|report)\b/.test(lower) && /\b(make|create|generate|write|build)\b/.test(lower)) {
    const topic = text.replace(/.*?\b(about|on|for)\b/i, '').trim() || 'Personal Offline Brief';
    actions.push({
      type: 'generatePdfDocument',
      args: { topic, title: topic.slice(0, 60) },
      resultText: `Generated offline PDF on "${topic}".`,
    });
    return {
      reply: `Offline Edge: I created a formatted PDF draft on "${topic}" and saved it to your Studio & Phone Vault.`,
      actions,
    };
  }

  // Security scan offline
  if (/\b(virus|scan|malware|security|suspicious)\b/.test(lower)) {
    actions.push({
      type: 'runSecurityAudit',
      args: { scanType: 'quick' },
      resultText: 'Triggered on-device security audit.',
    });
    return {
      reply: `Offline Edge: Running on-device package & permission sweep right now.`,
      actions,
    };
  }

  // Safe Math evaluator
  const mathCandidate = lower.replace(/[^0-9+\-*/().%\s]/g, '').trim();
  if (/^[\d\s+\-*/().%]+$/.test(mathCandidate) && /[+\-*/%]/.test(mathCandidate)) {
    try {
      const fn = new Function(`return (${mathCandidate});`);
      const val = fn();
      if (typeof val === 'number' && Number.isFinite(val)) {
        return {
          reply: `Offline Edge calculation: ${mathCandidate} = ${val}`,
          actions: [],
        };
      }
    } catch {
      // ignore invalid math
    }
  }

  // Local Vault Search
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  const localMatches = mobileIndex.filter((item) => {
    const hay = `${item.title} ${item.subtitle} ${item.contentPreview ?? ''}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });

  if (localMatches.length > 0) {
    return {
      reply: `Offline Edge found ${localMatches.length} item(s) in your private vault:\n${localMatches
        .slice(0, 4)
        .map((m) => `• ${m.title} (${m.type}) — ${m.subtitle}`)
        .join('\n')}`,
      actions: [],
    };
  }

  // Time / Date / Task Summary
  if (/\b(time|date|today|tasks|schedule)\b/.test(lower)) {
    const pending = tasks.filter((t) => !t.completed);
    return {
      reply: `It's ${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} on ${new Date().toLocaleDateString()}. You have ${pending.length} active task(s)${
        pending[0] ? `, starting with "${pending[0].title}"` : ''
      }.`,
      actions: [],
    };
  }

  return {
    reply: `Offline Edge Mode is active (100% private, zero network). I can control phone settings, set ringing alarms, create & edit PDFs, generate vector wallpapers, run math, search your vault, or trigger your command passkeys.`,
    actions: [],
  };
}
