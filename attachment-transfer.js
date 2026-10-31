(function (root) {
  'use strict';
  const CHUNK_SIZE = 6 * 1024 * 1024;
  const MAX_FILE_SIZE = 200 * 1024 * 1024;
  const bucket = client => client.storage.from('ondo-attachments');
  const path = (owner, id, index) => `${owner}/${id}.parts/${String(index).padStart(4, '0')}`;
  const sha256 = async blob => Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  const fail = error => { throw new Error(error?.message || '첨부파일 전송에 실패했어요.'); };

  async function upload(client, owner, record, options = {}) {
    const blob = record.blob;
    const check = () => { if (options.shouldContinue && !options.shouldContinue()) throw new Error('첨부파일 업로드가 취소됐어요.'); };
    check();
    if (!blob || blob.size > MAX_FILE_SIZE) throw new Error('파일 하나는 200MB 이하여야 해요.');
    if (blob.size <= CHUNK_SIZE) {
      const { error } = await bucket(client).upload(`${owner}/${record.id}`, blob, { upsert:true, contentType:record.type || blob.type || 'application/octet-stream' });
      if (error) fail(error);
      check();
      options.onProgress?.(blob.size, blob.size);
      return null;
    }
    const previous = options.resume;
    const state = { version:1, size:blob.size, chunkSize:CHUNK_SIZE, parts:previous?.version === 1 && previous.size === blob.size && previous.chunkSize === CHUNK_SIZE && Array.isArray(previous.parts) ? [...previous.parts] : [] };
    const count = Math.ceil(blob.size / CHUNK_SIZE);
    for (let index = 0; index < count; index++) {
      check();
      const part = blob.slice(index * CHUNK_SIZE, Math.min(blob.size, (index + 1) * CHUNK_SIZE));
      const digest = await sha256(part);
      check();
      if (state.parts[index]?.sha256 !== digest || state.parts[index]?.size !== part.size) {
        const { error } = await bucket(client).upload(path(owner, record.id, index), part, { upsert:true, contentType:'application/octet-stream' });
        if (error) fail(error);
        check();
        state.parts[index] = { size:part.size, sha256:digest };
        await options.saveResume?.({ ...state, parts:state.parts.slice(0, count) });
      }
      options.onProgress?.(Math.min(blob.size, (index + 1) * CHUNK_SIZE), blob.size);
    }
    check();
    return { version:1, size:blob.size, chunkSize:CHUNK_SIZE, parts:state.parts.slice(0, count) };
  }

  function validate(file) {
    const layout = file.cloudChunks;
    if (layout?.version !== 1 || layout.chunkSize !== CHUNK_SIZE || !Number.isSafeInteger(layout.size) || layout.size <= CHUNK_SIZE || layout.size > MAX_FILE_SIZE || layout.size !== Number(file.size) || !Array.isArray(layout.parts) || layout.parts.length !== Math.ceil(layout.size / CHUNK_SIZE)) throw new Error('파일의 저장 정보가 올바르지 않아요. 다시 동기화해 주세요.');
    layout.parts.forEach((part, index) => {
      const expected = Math.min(CHUNK_SIZE, layout.size - index * CHUNK_SIZE);
      if (part.size !== expected || !/^[a-f0-9]{64}$/.test(part.sha256 || '')) throw new Error('파일의 저장 정보가 손상됐어요. 다시 동기화해 주세요.');
    });
    return layout;
  }

  async function download(client, owner, file, onProgress) {
    if (!file.cloudChunks) {
      const { data, error } = await bucket(client).download(`${owner}/${file.id}`);
      if (error) fail(error);
      if (!data || (Number(file.size) > 0 && data.size !== Number(file.size))) throw new Error('파일 크기가 원본과 달라요. 다시 동기화해 주세요.');
      return data;
    }
    const layout = validate(file);
    const parts = [];
    let loaded = 0;
    for (let index = 0; index < layout.parts.length; index++) {
      const { data, error } = await bucket(client).download(path(owner, file.id, index));
      if (error) fail(error);
      if (!data || data.size !== layout.parts[index].size || await sha256(data) !== layout.parts[index].sha256) throw new Error('파일 일부가 원본과 달라요. 파일을 다시 업로드해 주세요.');
      parts.push(data); loaded += data.size; onProgress?.(loaded, layout.size);
    }
    return new Blob(parts, { type:file.type || 'application/octet-stream' });
  }

  function paths(owner, file) {
    const count = Math.min(Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE), Math.ceil((Number(file.size) || 0) / CHUNK_SIZE));
    return [`${owner}/${file.id}`, ...Array.from({ length:count > 1 ? count : 0 }, (_, index) => path(owner, file.id, index))];
  }

  root.OndoAttachmentTransfer = Object.freeze({ upload, download, paths, MAX_FILE_SIZE, CHUNK_SIZE });
})(globalThis);
