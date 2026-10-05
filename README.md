# Service Mesh com Istio

Laboratório de service mesh: uma API NestJS rodando em um cluster Kind com Istio
injetando sidecars, e a malha observada por Kiali, Prometheus e Jaeger.

## Stack

| Componente | Versão | Papel |
| --- | --- | --- |
| Kind | — | cluster local (1 control-plane + 2 workers) |
| Istio | 1.31.1 | service mesh (sidecar injection, ingress gateway) |
| Kiali | 2.8.0 | topologia e saúde da malha |
| Prometheus | 3.2.1 | métricas |
| Jaeger | 1.67.0 | tracing distribuído |
| NestJS | 11 | aplicação de exemplo |

## Estrutura

```
app/            API NestJS + Dockerfile multi-stage
  k8s/          Deployment e Service da aplicação
infra/          kind.yaml e os addons de observabilidade do Istio
```

## Subindo o ambiente

### 1. Cluster

```bash
kind create cluster --config infra/kind.yaml
```

### 2. Istio

```bash
istioctl install --set profile=demo -y
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
docker build -t gusmartins499/service-mesh:v1 ./app
```

```bash
kind load docker-image gusmartins499/service-mesh:v1 --name cluster-service-mesh
```

### 5. Namespace e deploy

O label `istio-injection=enabled` precisa estar no namespace **antes** do deploy —
a injeção do sidecar acontece na criação do pod, não retroativamente:

```bash
kubectl create namespace app-service-mesh
```

```bash
kubectl label namespace app-service-mesh istio-injection=enabled --overwrite
```

```bash
kubectl apply -f app/k8s -n app-service-mesh
```

Pods saudáveis aparecem como `2/2` — o container da aplicação mais o `istio-proxy`:

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
namespace para que a chamada passe pelos sidecars:

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
