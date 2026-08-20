```bash

mlxgen generate \
  --model AbstractFramework/wan2.2-i2v-a14b-diffusers-bf16 \
  --task image-to-video \
  --image ./input.png \
  --prompt "put his hand behind his head and dance" \
  --width 384 \
  --height 384 \
  --frames 33 \
  --steps 12 \
  --guidance 3.5 \
  --guidance-2 3.5 \
  --fps 8 \
  --seed 4242 \
  --low-ram \
  --metadata \
  --output video.mp4


```

<!-- high quality -->

```bash

uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-1.7B-Base \
 --text "Ghost reporting. ... 你好嗎?" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"

```

<!-- Low quality -->

```bash

uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-0.6B-Base \
 --text "Ghost reporting. 明月幾時有？把酒問青天。不知天上宮闕，今夕是何年。我欲乘風歸去，又恐瓊樓玉宇，高處不勝寒。起舞弄清影，何似在人間！轉朱閣，低綺戶，照無眠。不應有恨，何事長向別時圓？人有悲歡離合，月有陰晴圓缺，此事古難全。但願人長久，千里共嬋娟。 中秋節快樂！" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"



uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-0.6B-Base \
 --text "ghost reporting! Hi how are you?" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"


```

# Image editing

## 4B OK FOR COMMERCAIL USE APACHE LICENSE

```bash

mlxgen download --model AbstractFramework/flux.2-klein-4b-8bit

mlxgen generate \
  --output result.png \
  --model AbstractFramework/flux.2-klein-4b-8bit \
  --image input.jpeg \
  --image person.png \
  --prompt "The person and The ninja standing next to each other, in a studio, taking photo." \
  --mlx-cache-limit-gb 20 \
  --steps 5 --seed 42 --width 1024 --height 1024

```

#

#

# Upscale to 2048

```bash

mlxgen download --model AbstractFramework/seedvr2-3b-8bit

mlxgen upscale \
  --model AbstractFramework/seedvr2-3b-8bit \
  --image-path cafe.png \
  --resolution 2048 \
  --mlx-cache-limit-gb 20 \
  --output upscale_result_2048.png

```
