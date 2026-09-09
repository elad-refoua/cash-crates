import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretQueueMessage, createEventParser } from '../lib/flux-protocol.ts';

const quotaResponse = {
  msg: 'process_completed',
  output: { error: 'You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token for more quota - https://huggingface.co/settings/tokens', duration: 10, visible: true, title: 'ZeroGPU quota exceeded' },
  success: false, title: 'ZeroGPU quota exceeded',
};

test('the real provider failure is identified as quota exhaustion, not an unknown error', () => {
  const result = interpretQueueMessage(quotaResponse);
  assert.equal(result.type, 'error');
  assert.equal(result.kind, 'quota');
  assert.match(result.message, /daily allowance/i);
  assert.doesNotMatch(result.message, /may be busy|API key|hf_/i);
});

test('unknown failures are not invented as quota exhaustion', () => {
  const result = interpretQueueMessage({msg:'process_completed',success:false,output:{error:null}});
  assert.equal(result.kind, 'provider');
  assert.match(result.message, /did not provide a reason/i);
});

test('successful model output yields its image URL', () => {
  const url='https://black-forest-labs-flux-1-fill-dev.hf.space/gradio_api/file=/tmp/gradio/test/image.webp';
  assert.deepEqual(interpretQueueMessage({msg:'process_completed',success:true,output:{data:[{url},42]}}), {type:'result',url});
});

test('HTTP stream frames can be split across line endings without losing the failure', () => {
  const parse=createEventParser();
  const first='data: '+JSON.stringify(quotaResponse)+'\r';
  assert.deepEqual(parse(first),[]);
  assert.deepEqual(parse('\n\r'),[]);
  assert.deepEqual(parse('\n'),[quotaResponse]);
});

test('queue position is based on the service response', () => {
  assert.deepEqual(interpretQueueMessage({msg:'estimation',rank:2}),{type:'status',message:'Waiting for a free GPU · position 3 in the queue.'});
});
