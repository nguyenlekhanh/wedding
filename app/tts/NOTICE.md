# Third-party licences — TiecCuoiLive MC voice

This folder integrates a local, offline text-to-speech engine. No cloud API is
called at runtime, and no Python or GPU is required.

| Component | Version | Licence | Role |
|---|---|---|---|
| `kokoro-js` | 1.2.1 | Apache-2.0 | JS/ONNX runtime wrapper for Kokoro |
| Kokoro-82M (model weights + voices) | v1.0 | Apache-2.0 | The neural voice model (`hexgrad/Kokoro-82M`) |
| ONNX export `onnx-community/Kokoro-82M-ONNX` | v1.0 | Apache-2.0 (weights) | Quantised `model_quantized.onnx` + `voices/*.bin` |
| `@huggingface/transformers` | 3.x | Apache-2.0 | Model loading / tokenisation |
| `onnxruntime-node` | 1.21.0 | MIT | CPU inference |
| `sharp` | 0.34.5 | Apache-2.0 | transitive dependency of transformers.js |
| Voice style tensors (`af_heart` etc.) | v1.0 | Apache-2.0 | Bundled inside the `kokoro-js` package (`voices/*.bin`), never fetched at runtime |

Model assets live in `app/tts/models/onnx-community/Kokoro-82M-ONNX/` and are loaded
from disk (`allowRemoteModels` is only enabled for the first download).

## What this means for distribution

- The **model weights are Apache-2.0**: commercial use is permitted. Keep this
  notice and the upstream attribution (`hexgrad/Kokoro-82M`) with the product.
- `kokoro-js` is **Apache-2.0**, so bundling it does **not** impose copyleft on
  the rest of TiecCuoiLive (unlike Piper, which is GPL-3.0).
- No voice-cloning, celebrity, or non-commercial voice data is used. `af_heart`
  is part of the Apache-2.0 Kokoro release.
- The model files under `models/` are **not** committed to git (see
  `.gitignore`); they are fetched once by `npm run tts:download`.

## Full texts

The upstream licence files ship inside the installed packages and can be copied
next to a release build:

```
node_modules/kokoro-js/LICENSE
node_modules/@huggingface/transformers/LICENSE
node_modules/onnxruntime-node/LICENSE
```

Upstream project: https://github.com/hexgrad/kokoro
Model card: https://huggingface.co/hexgrad/Kokoro-82M
