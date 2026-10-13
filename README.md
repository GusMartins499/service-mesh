# Service Mesh com Istio

Laboratório de service mesh: uma API NestJS rodando em um cluster Kind com Istio
em modo **ambient** (sem sidecar), e a malha observada por Kiali, Prometheus e Jaeger.

## Stack

| Componente | Versão | Papel |
| --- | --- | --- |
| Kind | — | cluster local (1 control-plane + 2 workers) |
| Istio | 1.31.1 | service mesh em modo ambient (ztunnel + waypoint) |
| Kiali | 2.8.0 | topologia e saúde da malha |
| Prometheus | 3.2.1 | métricas |
| Jaeger | 1.67.0 | tracing distribuído |
| NestJS | 11 | aplicação de exemplo |

## Estrutura

```
app/            API NestJS + Dockerfile multi-stage
  k8s/          Deployments, Service, DestinationRule e VirtualService da aplicação
infra/          kind.yaml, addons de observabilidade, namespace e waypoint da aplicação
```

## Modo ambient

No modo ambient o pod não ganha um container `istio-proxy`. O tráfego é dividido
em duas camadas:

- **ztunnel** — um proxy por nó que captura o tráfego dos pods e cuida da camada
  L4: mTLS, identidade e telemetria básica.
- **waypoint** — um Envoy compartilhado pelo namespace ([infra/gateway.yaml](infra/gateway.yaml))
  que aplica as regras L7: `VirtualService`, `DestinationRule`, retries, timeouts,
  fault injection e roteamento por query param. O ztunnel entrega o tráfego a ele
  por um túnel HBONE na porta 15008.

O namespace entra na malha pelos labels em [infra/app-ns.yaml](infra/app-ns.yaml):
`istio.io/dataplane-mode: ambient` e `istio.io/use-waypoint: waypoint`.

## Subindo o ambiente

### 1. Cluster

```bash
kind create cluster --config infra/kind.yaml
```

### 2. Istio

O waypoint é um `Gateway` da Gateway API, então as CRDs precisam existir no cluster:

```bash
kubectl get crd gateways.gateway.networking.k8s.io || kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml
```

O profile `ambient` instala o ztunnel e o CNI do Istio, que fazem a captura do
tráfego sem sidecar:

```bash
istioctl install --set profile=ambient -y
```

### 3. Addons de observabilidade

Os três manifestos vão para o namespace `istio-system`, criado pelo passo anterior:

```bash
kubectl apply -f infra/prometheus.yaml -f infra/jaeger.yaml -f infra/kiali.yaml
```

### 4. Imagem da aplicação

O `imagePullPolicy` é `IfNotPresent` e o cluster é Kind, então a imagem precisa ser
carregada nos nós — não existe registry no meio:

```bash
docker build -t gusmartins499/service-mesh:v3 ./app
```

```bash
kind load docker-image gusmartins499/service-mesh:v3 --name cluster-service-mesh
```

### 5. Namespace e deploy

O namespace já vem com os labels do modo ambient, e o waypoint precisa existir
nele antes da aplicação:

```bash
kubectl apply -f infra/app-ns.yaml
```

```bash
kubectl apply -f infra/gateway.yaml
```

O waypoint sobe como um Deployment próprio no namespace (`waypoint`):

```bash
kubectl get gateway waypoint -n app-service-mesh
```

Não use o label `istio-injection=enabled` neste namespace — sidecar e ambient não
devem ser misturados. Se o namespace veio de uma instalação antiga, remova o label
e recrie os pods:

```bash
kubectl label namespace app-service-mesh istio-injection-
```

```bash
kubectl apply -f app/k8s -n app-service-mesh
```

Pods saudáveis aparecem como `1/1` — só o container da aplicação, sem `istio-proxy`:

```bash
kubectl get pods -n app-service-mesh
```

## Observabilidade

```bash
istioctl dashboard kiali
```

```bash
istioctl dashboard jaeger
```

```bash
istioctl dashboard prometheus
```

## Gerando carga

O Kiali só desenha o grafo da malha quando há tráfego. O `fortio` roda dentro do
namespace para que a chamada passe pelo ztunnel e pelo waypoint:

```bash
kubectl run -it fortio -n app-service-mesh --rm --restart=Never --image=fortio/fortio -- load -qps 6000 -t 120s -c 50 "http://app-service-mesh-svc/"
```

O `--restart=Never` não é opcional. Sem ele o pod nasce com `restartPolicy: Always`,
o container reinicia em vez de encerrar, a sessão anexada nunca termina e o `--rm`
nunca dispara — o pod fica para trás e a próxima execução falha com `AlreadyExists`.
Quando isso acontecer:

```bash
kubectl delete pod fortio -n app-service-mesh
```

## Limpando

```bash
kind delete cluster --name cluster-service-mesh
```
