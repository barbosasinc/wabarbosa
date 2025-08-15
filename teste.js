curl -i -X POST `
  https://graph.facebook.com/v22.0/778752671981810/messages `
  -H 'Authorization: Bearer <access token>' `
  -H 'Content-Type: application/json' `
  -d '{ \"messaging_product\": \"whatsapp\", \"to\": \"5519982292047\", \"type\": \"template\", \"template\": { \"name\": \"hello_world\", \"language\": { \"code\": \"en_US\" } } }'
