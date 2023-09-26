import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
    display: block;
    position: relative;
    background: #848850;
    color: #fff;
    border-bottom: 2px solid #5f561b;
`;

const Title = styled.div`
    display: inline-block;
    margin: 14px 50px;
    font-family: 'Ubuntu Mono', monospace;
    font-size: 40px;
`;

const Buttons = styled.div`
    position: absolute;
    bottom: 7px;
    right: 50px;
`;

const Link = styled.a`
    margin-left: 7px;
`;

export default () => (
    <Container>
        <Title>$ decomposerize</Title>
        <Buttons>
            <Link href="https://github.com/outilslibre/decomposerize">
                <img alt="npm" src="https://img.shields.io/npm/v/decomposerize" />
            </Link>
            <Link href="https://github.com/outilslibre/decomposerize">
                <img
                    src="https://img.shields.io/github/stars/outilslibre/decomposerize.svg?style=social&label=Star"
                    alt="github"
                />
            </Link>
        </Buttons>
    </Container>
);
