import { useState } from "react";
import { Botao } from "./componentes/Botao.jsx";
import { Campo } from "./componentes/Campo.jsx";
import { Menu } from "./componentes/Menu.jsx";
import { Cartao } from "./Cartao.jsx";

/** Coluna do quadro: uma lista com os cartões que ela guarda. */
export function Lista({
  lista,
  listas,
  arrastando,
  apontado,
  listaAlvo,
  aoCriarCartao,
  aoRenomear,
  aoExcluir,
  aoEditarCartao,
  aoExcluirCartao,
  aoMoverCartao,
  aoArrastarInicio,
  aoArrastarFim,
  aoApontar,
  aoApontarLista,
  aoSoltar,
}) {
  const [novo, setNovo] = useState(false);
  const [titulo, setTitulo] = useState("");

  const adicionar = (e) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    aoCriarCartao(lista.id, titulo.trim());
    setTitulo("");
    setNovo(false);
  };

  const apontar = (cartaoId) => {
    aoApontar(cartaoId);
    aoApontarLista(lista.id);
  };

  return (
    <section
      className="lista"
      aria-label={lista.title}
      data-alvo={listaAlvo ? "" : undefined}
      onDragOver={(e) => { e.preventDefault(); apontar(null); }}
      onDrop={(e) => { e.preventDefault(); aoSoltar(lista.id); }}
    >
      <header className="lista-topo">
        <button type="button" className="lista-nome" onClick={aoRenomear} title="Renomear lista">
          {lista.title}
        </button>
        <span className="lista-contagem">{lista.cards?.length ?? 0}</span>
        <Menu
          rotulo={`Opções da lista ${lista.title}`}
          itens={[
            { rotulo: "Renomear lista", icone: "lapis", aoClicar: aoRenomear },
            { rotulo: "Excluir lista", icone: "lixeira", perigo: true, aoClicar: aoExcluir },
          ]}
        />
      </header>

      <div className="lista-cartoes">
        {lista.cards?.map((cartao) => (
          <Cartao
            key={cartao.id}
            cartao={cartao}
            listas={listas}
            arrastando={arrastando === cartao.id}
            apontado={apontado === cartao.id}
            aoEditar={() => aoEditarCartao(cartao)}
            aoExcluir={() => aoExcluirCartao(cartao)}
            aoMover={(listaId) => aoMoverCartao(cartao, listaId)}
            aoArrastarInicio={aoArrastarInicio}
            aoArrastarFim={aoArrastarFim}
            aoApontar={apontar}
          />
        ))}
        {lista.cards?.length ? null : <p className="lista-vazia">Nenhum cartão nesta lista.</p>}
      </div>

      <div className="lista-rodape">
        {novo ? (
          <form className="form-linha" onSubmit={adicionar}>
            <Campo
              rotulo="Título do cartão"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="O que precisa ser feito?"
              maxLength={200}
              autoFocus
            />
            <div className="rodape-linha">
              <Botao variante="primario" type="submit" disabled={!titulo.trim()}>Adicionar cartão</Botao>
              <Botao variante="fantasma" icone="fechar" aria-label="Cancelar novo cartão" onClick={() => { setNovo(false); setTitulo(""); }} />
            </div>
          </form>
        ) : (
          <Botao variante="suave" className="botao-bloco botao-neon" icone="mais" onClick={() => setNovo(true)}>Adicionar cartão</Botao>
        )}
      </div>
    </section>
  );
}
