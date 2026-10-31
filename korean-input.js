// Preserve native IME events (https://www.w3.org/TR/uievents/#events-compositionevents).
// Assemble only a continuous jamo stream from browsers that commit insertText
// without composition events. Paste, existing text, and native IMEs stay intact.
globalThis.OndoKoreanInput = (() => {
  const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const vowels = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const finals = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  const vowelPairs = { 'ㅗㅏ':'ㅘ', 'ㅗㅐ':'ㅙ', 'ㅗㅣ':'ㅚ', 'ㅜㅓ':'ㅝ', 'ㅜㅔ':'ㅞ', 'ㅜㅣ':'ㅟ', 'ㅡㅣ':'ㅢ' };
  const finalPairs = { 'ㄱㅅ':'ㄳ', 'ㄴㅈ':'ㄵ', 'ㄴㅎ':'ㄶ', 'ㄹㄱ':'ㄺ', 'ㄹㅁ':'ㄻ', 'ㄹㅂ':'ㄼ', 'ㄹㅅ':'ㄽ', 'ㄹㅌ':'ㄾ', 'ㄹㅍ':'ㄿ', 'ㄹㅎ':'ㅀ', 'ㅂㅅ':'ㅄ' };
  const splitFinals = Object.fromEntries(Object.entries(finalPairs).map(([pair, combined]) => [combined, pair]));
  const splitVowels = Object.fromEntries(Object.entries(vowelPairs).map(([pair, combined]) => [combined, pair]));
  const composing = new WeakSet(), nativeInputs = new WeakSet(), states = new WeakMap();
  const pendingSubmits = new WeakSet();
  function assemble(raw) {
    let result = '', initial = '', vowel = '', final = '';
    const flush = () => {
      result += initial && vowel ? String.fromCharCode(0xac00 + (initials.indexOf(initial) * 21 + vowels.indexOf(vowel)) * 28 + (final ? finals.indexOf(final) : 0)) : initial + vowel + final;
      initial = vowel = final = '';
    };
    for (let char of raw) {
      const code = char.charCodeAt(0);
      if (code >= 0x1100 && code <= 0x1112) char = initials[code - 0x1100];
      else if (code >= 0x1161 && code <= 0x1175) char = vowels[code - 0x1161];
      else if (code >= 0x11a8 && code <= 0x11c2) char = finals[code - 0x11a7];
      if (vowels.includes(char)) {
        if (initial && vowel && final) {
          const pair = splitFinals[final], nextInitial = pair ? pair[1] : final;
          final = pair ? pair[0] : ''; flush(); initial = nextInitial; vowel = char;
        } else if (initial && vowel && vowelPairs[vowel + char]) vowel = vowelPairs[vowel + char];
        else if (initial && !vowel) vowel = char;
        else { flush(); result += char; }
      } else if (initials.includes(char) || finals.includes(char) && char !== ' ') {
        if (initial && vowel && !final && finals.indexOf(char) > 0) final = char;
        else if (initial && vowel && finalPairs[final + char]) final = finalPairs[final + char];
        else { flush(); if (initials.includes(char)) initial = char; else result += char; }
      } else { flush(); result += char; }
    }
    flush(); return result;
  }
  const isComposing = event => event.isComposing || event.keyCode === 229 || composing.has(event.target);
  function removeLastJamo(char) {
    const syllable = char.charCodeAt(0) - 0xac00;
    if (syllable < 0 || syllable > 11171) return '';
    const vowel = vowels[Math.floor(syllable / 28) % 21], final = finals[syllable % 28];
    return (initials[Math.floor(syllable / 588)] + (splitVowels[vowel] || vowel) + (syllable % 28 ? splitFinals[final] || final : '')).slice(0, -1);
  }
  function bind(input) {
    let before = null;
    input.addEventListener('compositionstart', () => { composing.add(input); nativeInputs.add(input); states.delete(input); before = null; });
    input.addEventListener('compositionend', () => { composing.delete(input); });
    input.addEventListener('blur', () => { composing.delete(input); states.delete(input); before = null; });
    input.addEventListener('pointerdown', () => { states.delete(input); });
    input.addEventListener('keydown', event => {
      if (event.key.startsWith('Arrow') || ['Home','End','Tab','Enter','Escape','Delete'].includes(event.key) || event.metaKey || event.ctrlKey) states.delete(input);
      if (event.key === 'Enter' && isComposing(event) && input.form) {
        const form = input.form; pendingSubmits.add(form); setTimeout(() => pendingSubmits.delete(form), 0);
      }
    });
    input.addEventListener('beforeinput', event => {
      before = null;
      if (isComposing(event)) { nativeInputs.add(input); return; }
      if (nativeInputs.has(input)) return;
      if (event.inputType !== 'insertText' && event.inputType !== 'deleteContentBackward') { states.delete(input); return; }
      before = { value:input.value, start:input.selectionStart, end:input.selectionEnd, type:event.inputType };
    });
    input.addEventListener('input', event => {
      const previous = before; before = null;
      if (isComposing(event) || nativeInputs.has(input) || !previous || previous.start === null) return;
      let state = states.get(input);
      const continuing = state && state.value === previous.value && previous.start === previous.end && previous.start === state.caret;
      if (previous.type === 'deleteContentBackward') {
        if (!continuing || !state.raw) { states.delete(input); return; }
        // Backspace edits the last syllable without pulling a consonant back
        // into a previously committed syllable (데이 → 데ㅇ, rather than 뎅).
        state.start = previous.start - 1;
        state.raw = removeLastJamo(previous.value[state.start]);
      } else {
        const end = input.value.length - (previous.value.length - previous.end);
        const inserted = input.value.slice(previous.start, end);
        if (!/^[\u1100-\u1112\u1161-\u1175\u11a8-\u11c2\u3131-\u3163]+$/.test(inserted) || input.value !== previous.value.slice(0, previous.start) + inserted + previous.value.slice(previous.end)) { states.delete(input); return; }
        if (!continuing) state = { start:previous.start, raw:'' };
        state.raw += inserted;
      }
      const text = assemble(state.raw);
      input.setRangeText(text, state.start, input.selectionStart, 'end');
      state.value = input.value; state.caret = input.selectionStart;
      if (state.raw) states.set(input, state); else states.delete(input);
    });
  }
  function install(root) {
    root.querySelectorAll('input, textarea').forEach(input => { if (input.tagName === 'TEXTAREA' || input.type === 'text' || input.type === 'search') bind(input); });
    root.addEventListener('submit', event => {
      if (pendingSubmits.has(event.target) || Array.from(event.target.elements || []).some(input => composing.has(input))) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }
  return { assemble, install, isComposing };
})();
