import { useState, useEffect } from "react";
import { Botao } from "./componentes/Botao.jsx";
import { Campo } from "./componentes/Campo.jsx";
import { Icone } from "./componentes/Icone.jsx";
import { Lista } from "./Lista.jsx";
import { posicaoDeDestino } from "./ordem.js";

/** Quadro aberto: título, listas em linha horizontal e o arrastar nativo entre elas. */
export function TelaQuadro({
  board,
  listas,
  aoRenomearQuadro,
  aoExcluirQuadro,
  aoCriarLista,
  aoRenomearLista,
  aoExcluirLista,
  aoCriarCartao,
  aoEditarCartao,
  aoExcluirCartao,
  aoMoverCartao,
  aoSoltarCartao,
}) {
  const [arrastando, setArrastando] = useState(null);
  const [apontado, setApontado] = useState(null);
  const [listaAlvo, setListaAlvo] = useState(null);
  const [novaLista, setNovaLista] = useState(false);
  const [tituloLista, setTituloLista] = useState("");
  const [modoEscuro, setModoEscuro] = useState(() => {
    const salvo = localStorage.getItem("fluxo_modo_escuro");
    if (salvo !== null) return salvo === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    localStorage.setItem("fluxo_modo_escuro", modoEscuro);
    if (modoEscuro) {
      document.documentElement.setAttribute("data-tema", "escuro");
    } else {
      document.documentElement.removeAttribute("data-tema");
    }
  }, [modoEscuro]);

  const criarLista = (e) => {
    e.preventDefault();
    if (!tituloLista.trim()) return;
    aoCriarLista(tituloLista.trim());
    setTituloLista("");
    setNovaLista(false);
  };

  const soltar = (listaId) => {
    const cartaoId = arrastando;
    setArrastando(null);
    setApontado(null);
    setListaAlvo(null);
    if (!cartaoId) return;
    const lista = listas.find((l) => l.id === listaId);
    const semCartao = (lista?.cards ?? []).filter((c) => c.id !== cartaoId);
    aoSoltarCartao(cartaoId, listaId, posicaoDeDestino(semCartao, apontado));
  };

  return (
    <>
      <header className="quadro-topo">
        <h1 className="quadro-titulo">{board.title}</h1>
        <div className="quadro-acoes">
          <Botao
            variante="fantasma"
            icone={modoEscuro ? "sol" : "lua"}
            aria-label="Alternar modo escuro"
            onClick={() => setModoEscuro(!modoEscuro)}
          />
          <Botao variante="fantasma" icone="lapis" aria-label="Renomear quadro" onClick={aoRenomearQuadro} />
          <Botao variante="fantasma" icone="lixeira" aria-label="Excluir quadro" onClick={aoExcluirQuadro} />
        </div>
      </header>

      {listas.length ? null : (
        <div className="vazio-canvas">
          <h2>Nenhuma lista neste quadro</h2>
          <p>As listas são as colunas do quadro: "A fazer", "Em andamento", "Pronto". Comece pela primeira.</p>
          <Botao variante="primario" icone="mais" onClick={() => setNovaLista(true)}>Adicionar lista</Botao>
        </div>
      )}

      <div className="listas">
        {listas.map((lista) => (
          <Lista
            key={lista.id}
            lista={lista}
            listas={listas}
            arrastando={arrastando}
            apontado={apontado}
            listaAlvo={listaAlvo === lista.id}
            aoCriarCartao={aoCriarCartao}
            aoRenomear={() => aoRenomearLista(lista)}
            aoExcluir={() => aoExcluirLista(lista)}
            aoEditarCartao={aoEditarCartao}
            aoExcluirCartao={aoExcluirCartao}
            aoMoverCartao={aoMoverCartao}
            aoArrastarInicio={setArrastando}
            aoArrastarFim={() => { setArrastando(null); setApontado(null); setListaAlvo(null); }}
            aoApontar={setApontado}
            aoApontarLista={setListaAlvo}
            aoSoltar={soltar}
          />
        ))}

        <div className="nova-lista">
          {novaLista ? (
            <form className="form-linha" onSubmit={criarLista}>
              <Campo
                rotulo="Título da lista"
                value={tituloLista}
                onChange={(e) => setTituloLista(e.target.value)}
                placeholder="Ex.: A fazer"
                maxLength={120}
                autoFocus
              />
              <div className="rodape-linha">
                <Botao variante="primario" type="submit" disabled={!tituloLista.trim()}>Adicionar lista</Botao>
                <Botao variante="fantasma" icone="fechar" aria-label="Cancelar nova lista" onClick={() => { setNovaLista(false); setTituloLista(""); }} />
              </div>
            </form>
          ) : (
            <Botao variante="suave" className="botao-bloco" icone="mais" onClick={() => setNovaLista(true)}>Adicionar lista</Botao>
          )}
        </div>
      </div>

      {arrastando ? (
        <p className="carregando-line" role="status" aria-live="polite">
          <Icone nome="arrastar" tamanho={16} />
          Solte o cartão na lista desejada.
        </p>
      ) : null}
    </>
  );
}
