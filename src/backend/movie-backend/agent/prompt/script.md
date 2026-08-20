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
